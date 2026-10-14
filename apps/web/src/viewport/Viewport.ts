import {
	applyViewPreset,
	closestParamOnLine,
	type Design,
	designBounds,
	fitDistance,
	fitToBounds,
	lookAlongNormal,
	type MeshData,
	type NodeId,
	type OrbitState,
	rayAnyPlaneIntersection,
	rayPlaneIntersection,
	rayVerticalPlaneIntersection,
	translationOf,
	type Vec3,
	type ViewPresetName,
	type WorkPlane,
} from '@holecraft/core';
import * as THREE from 'three';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { createBandMarker } from './bandMarker.ts';
import { CameraRig, FOV_DEG, type Projection } from './CameraRig.ts';
import { DesignScene } from './DesignScene.ts';
import { createPlaneMarker } from './planeMarker.ts';
import { dragModeFor } from './pressMode.ts';
import { thumbnailCamera } from './thumbnailCamera.ts';
import { type Point, twoFingerStep } from './touchGesture.ts';
import { createWorkplane } from './workplane.ts';

/** Rectangle in pixels, relative to the viewport. */
export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ViewportOptions {
	workplaneWidth: number;
	workplaneDepth: number;
	/** Called whenever the camera moves, including once at start-up. */
	onCameraChange: (state: OrbitState, projection: Projection) => void;
	/** `down` on press; `click` on release if the pointer never dragged. `id` is null over empty space. */
	onPick: (id: NodeId | null, additive: boolean, phase: 'down' | 'click') => void;
	onMoveStart: () => void;
	/** Total pointer movement on the workplane since the drag began, in mm. */
	onMove: (delta: [number, number]) => void;
	onMoveEnd: () => void;
	onMarquee: (ids: NodeId[], additive: boolean) => void;
	/** The marquee being dragged, or null when it ends. */
	onMarqueeRect: (rect: PixelRect | null) => void;
}

const WHEEL_RATE = 0.001;
/** Pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

type CameraDrag = { mode: 'orbit' | 'pan'; x: number; y: number };

interface LeftPress {
	id: NodeId | null;
	additive: boolean;
	startX: number;
	startY: number;
	/** Height of the pressed shape's base; dragging follows the horizontal plane at that height. */
	planeZ: number;
	startGround: [number, number] | null;
	mode: 'move' | 'marquee' | 'orbit' | 'none' | null;
	/** A finger rather than a mouse: dragging empty space orbits instead of drawing a marquee. */
	touch: boolean;
	lastX: number;
	lastY: number;
}

/**
 * Imperative three.js engine. React only mounts it; per-frame work (camera, picking,
 * dragging) stays here. The scene is Z-up, in millimetres, and renders on demand.
 *
 * Left button: click selects, dragging a shape moves it, dragging empty space draws a marquee.
 * Right-drag orbits, middle-drag or shift+right-drag pans, wheel zooms.
 *
 * Touch: one finger on a shape selects and moves it, one finger on empty space orbits, and two
 * fingers pan (slide) and zoom (pinch). A second finger cancels whatever one finger was doing.
 */
export class Viewport {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly rig: CameraRig;
	private readonly designScene = new DesignScene();
	private readonly raycaster = new THREE.Raycaster();
	private readonly resizeObserver: ResizeObserver;
	private readonly canvas: HTMLCanvasElement;
	private design: Design | null = null;
	private workplane: THREE.Object3D | null = null;
	private frame = 0;
	private cameraDrag: CameraDrag | null = null;
	private left: LeftPress | null = null;
	private readonly fingers = new Map<number, Point>();
	private pinch: [Point, Point] | null = null;
	/** While the ruler is on, the left button no longer selects or moves: clicks belong to the ruler and dragging orbits. */
	private surfaceToolOn = false;
	private toolPaintsOnDrag = false;
	private lastSync: {
		results?: ReadonlyMap<NodeId, GroupResult> | undefined;
		failed?: ReadonlySet<NodeId> | undefined;
		meshes?: ReadonlyMap<string, MeshData> | undefined;
	} = {};
	private bandMarker: THREE.Group | null = null;
	private multiSelectOn = false;
	private planeMarker: THREE.Object3D | null = null;

	constructor(
		private readonly host: HTMLElement,
		private readonly opts: ViewportOptions,
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.canvas = this.renderer.domElement;
		host.appendChild(this.canvas);

		this.scene.background = new THREE.Color(0xe7ecf0);
		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
		const sun = new THREE.DirectionalLight(0xffffff, 1.4);
		sun.position.set(-120, -200, 300);
		this.scene.add(sun);
		this.workplane = createWorkplane(opts.workplaneWidth, opts.workplaneDepth);
		this.scene.add(this.workplane);
		this.scene.add(this.designScene.root);

		this.rig = new CameraRig((state, projection) => {
			opts.onCameraChange(state, projection);
			this.requestRender();
		});

		this.canvas.addEventListener('pointerdown', this.onPointerDown);
		this.canvas.addEventListener('pointermove', this.onPointerMove);
		this.canvas.addEventListener('pointerup', this.onPointerUp);
		this.canvas.addEventListener('pointercancel', this.onPointerUp);
		this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
		this.canvas.addEventListener('contextmenu', this.onContextMenu);

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(host);
		this.resize();
		this.rig.notify();
	}

	/** `results` and `failed` come from the GeometryService: the computed shapes of top-level groups. */
	setDesign(
		design: Design,
		results?: ReadonlyMap<NodeId, GroupResult>,
		failed?: ReadonlySet<NodeId>,
		meshes?: ReadonlyMap<string, MeshData>,
	): void {
		this.design = design;
		this.lastSync = { results, failed, meshes };
		this.designScene.sync(design, results, failed, meshes);
		this.requestRender();
	}

	/** Draws every shape faint (while a sketch is drawn over them), or solid again. */
	setDimmed(on: boolean): void {
		this.designScene.setDimmed(on);
		if (this.design) this.designScene.sync(this.design, this.lastSync.results, this.lastSync.failed, this.lastSync.meshes);
		this.requestRender();
	}

	/** Moves the camera to a state and projection (back to the view before a sketch took it over). */
	goToView(state: OrbitState, projection: Projection, animate = true): void {
		this.rig.setProjection(projection);
		this.rig.goTo(state, { animate });
		this.requestRender();
	}

	/** Looks straight at a plane, from its front, in orthographic projection, about `size` mm across (so a drawing on it is true to scale). */
	lookAtPlane(plane: WorkPlane, size: number): void {
		const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
		const distance = fitDistance((size / 2) * 1.2, FOV_DEG, aspect);
		this.rig.setProjection('orthographic');
		this.rig.goTo(lookAlongNormal(this.rig.state, plane.normal, plane.origin, distance));
		this.requestRender();
	}

	setSelection(ids: readonly NodeId[]): void {
		this.designScene.setSelection(ids);
		this.requestRender();
	}

	home(): void {
		this.rig.goHome();
		this.requestRender();
	}

	/** Frames everything in the design; with nothing to frame, returns to the home view. */
	fitAll(): void {
		const bounds = this.design && designBounds(this.design);
		if (!bounds) {
			this.home();
			return;
		}
		const aspect = this.host.clientWidth / Math.max(1, this.host.clientHeight);
		this.rig.goTo(fitToBounds(this.rig.state, bounds, FOV_DEG, aspect));
		this.requestRender();
	}

	setView(name: ViewPresetName): void {
		this.rig.goTo(applyViewPreset(this.rig.state, name));
		this.requestRender();
	}

	/**
	 * A small PNG of the whole design from the home angle, without the workplane or the selection, for
	 * the designs list. Drawn by a second renderer, so the visible view is not disturbed. Null when
	 * there is nothing to draw.
	 */
	async snapshot(width = 320, height = 240): Promise<Blob | null> {
		const bounds = this.design && designBounds(this.design);
		if (!bounds) return null;

		const camera = thumbnailCamera(bounds, width / height);

		const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		try {
			renderer.setPixelRatio(1);
			renderer.setSize(width, height, false);
			if (this.workplane) this.workplane.visible = false;
			if (this.planeMarker) this.planeMarker.visible = false;
			try {
				this.designScene.withoutSelection(() => renderer.render(this.scene, camera));
			} finally {
				if (this.workplane) this.workplane.visible = true;
				if (this.planeMarker) this.planeMarker.visible = true;
			}
			return await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, 'image/png'));
		} finally {
			renderer.dispose();
			renderer.forceContextLoss();
		}
	}

	setProjection(projection: Projection): void {
		this.rig.setProjection(projection);
	}

	/** (x, y) in mm where a screen position meets the horizontal plane at `planeZ`, or null if it never does. */
	pickWorkplane(clientX: number, clientY: number, planeZ = 0): [number, number] | null {
		if (!this.aim(clientX, clientY)) return null;
		const { origin, direction } = this.raycaster.ray;
		const hit = rayPlaneIntersection([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], planeZ);
		return hit ? [hit[0], hit[1]] : null;
	}

	/**
	 * The height in mm under a screen position, measured on the vertical plane through workplane
	 * point `at` that faces the camera. Null when looking straight down (no usable plane).
	 */
	pickHeight(clientX: number, clientY: number, at: [number, number]): number | null {
		if (!this.aim(clientX, clientY)) return null;
		const { origin, direction } = this.raycaster.ray;
		const cam = this.rig.active.position;
		const hit = rayVerticalPlaneIntersection([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], at, [
			cam.x - at[0],
			cam.y - at[1],
		]);
		return hit ? hit[2] : null;
	}

	/**
	 * Where along the line from `origin` in unit direction `dir` a screen position points, as a distance from `origin`: the
	 * closest point of the line to the pointer's ray. For a tipped shape's own up axis. Null when looking along the line.
	 */
	pickAlongAxis(clientX: number, clientY: number, origin: Vec3, dir: Vec3): number | null {
		if (!this.aim(clientX, clientY)) return null;
		const { origin: o, direction: d } = this.raycaster.ray;
		return closestParamOnLine([o.x, o.y, o.z], [d.x, d.y, d.z], origin, dir);
	}

	/** Where a screen position meets the plane through `point` with normal `normal`, or null (edge-on, or behind). */
	pickPlane(clientX: number, clientY: number, point: Vec3, normal: Vec3): Vec3 | null {
		if (!this.aim(clientX, clientY)) return null;
		const { origin, direction } = this.raycaster.ray;
		return rayAnyPlaneIntersection([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], point, normal);
	}

	/** Pixel position within the viewport of a world point, or null if it is behind the camera. */
	project(point: Vec3): { x: number; y: number } | null {
		const camera = this.rig.active;
		camera.updateMatrixWorld();
		const p = new THREE.Vector3(...point);
		if (p.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return null;
		p.project(camera);
		return { x: ((p.x + 1) / 2) * this.host.clientWidth, y: ((1 - p.y) / 2) * this.host.clientHeight };
	}

	/** How many pixels a millimetre is across the view at a world point (the same for every direction across the view). */
	pixelsPerMm(point: Vec3): number {
		const camera = this.rig.active;
		camera.updateMatrixWorld();
		const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
		const [a, b] = [this.project(point), this.project([point[0] + right.x, point[1] + right.y, point[2] + right.z])];
		return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
	}

	/** Whether a face at `point` with this outward `normal` points towards the camera (cheap: no rays). */
	facesCamera(point: Vec3, normal: Vec3): boolean {
		const camera = this.rig.active;
		camera.updateMatrixWorld();
		const toward = new THREE.Vector3();
		if (camera instanceof THREE.OrthographicCamera) camera.getWorldDirection(toward).negate();
		else toward.setFromMatrixPosition(camera.matrixWorld).sub(new THREE.Vector3(...point));
		return toward.x * normal[0] + toward.y * normal[1] + toward.z * normal[2] > 0;
	}

	/**
	 * Whether a world point can be seen: in front of the camera and not behind any shown shape. A point on a shape's own surface
	 * (an edge) counts as seen; a small allowance absorbs rounding where the ray grazes the faces meeting there.
	 */
	canSee(point: Vec3): boolean {
		const camera = this.rig.active;
		camera.updateMatrixWorld();
		const p = new THREE.Vector3(...point);
		if (p.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return false;
		const ndc = p.clone().project(camera);
		this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
		const hit = this.designScene.pickHit(this.raycaster);
		if (!hit) return true;
		const origin = this.raycaster.ray.origin;
		const toPoint = origin.distanceTo(p);
		return origin.distanceTo(new THREE.Vector3(...hit.point)) >= toPoint - Math.max(0.05, toPoint * 1e-3);
	}

	/** While a surface tool (ruler, workplane) is on, the left button no longer selects or moves: clicks belong to the tool and dragging orbits. */
	setSurfaceTool(on: boolean, paintsOnDrag = false): void {
		this.surfaceToolOn = on;
		this.toolPaintsOnDrag = on && paintsOnDrag;
	}

	/** While the Select toggle is on, every press adds to (or takes from) the selection, and a finger on empty space draws the selection box. */
	setMultiSelect(on: boolean): void {
		this.multiSelectOn = on;
	}

	/** Shows the Height range tool's band as a translucent slab across an object, or removes it. */
	setBandMarker(band: { bounds: { min: Vec3; max: Vec3 }; z0: number; z1: number } | null): void {
		if (this.bandMarker) {
			this.scene.remove(this.bandMarker);
			this.bandMarker.traverse((o) => {
				if (o instanceof THREE.Mesh) {
					o.geometry.dispose();
					(o.material as THREE.Material).dispose();
				}
			});
			this.bandMarker = null;
		}
		if (band) {
			this.bandMarker = createBandMarker(band.bounds, band.z0, band.z1);
			this.scene.add(this.bandMarker);
		}
		this.requestRender();
	}

	/** Shows the Workplane tool's plane as a gridded square on the surface, or removes it. */
	setPlaneMarker(plane: WorkPlane | null): void {
		if (this.planeMarker) {
			this.scene.remove(this.planeMarker);
			this.planeMarker.traverse((o) => {
				if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
					o.geometry.dispose();
					(o.material as THREE.Material).dispose();
				}
			});
			this.planeMarker = null;
		}
		if (plane) {
			this.planeMarker = createPlaneMarker(plane);
			this.scene.add(this.planeMarker);
		}
		this.requestRender();
	}

	/** The element pointer events arrive on, for overlays that listen alongside the viewport. */
	get element(): HTMLElement {
		return this.canvas;
	}

	/**
	 * The surface under a screen position and which way it faces: a shape's face, else the workplane
	 * (inside its edges), else null. This is what the ruler measures between.
	 */
	pickSurface(clientX: number, clientY: number): { point: Vec3; normal: Vec3; id?: NodeId } | null {
		if (!this.aim(clientX, clientY)) return null;
		const hit = this.designScene.pickHit(this.raycaster);
		if (hit) return { point: hit.point, normal: hit.normal, id: hit.id };
		const { origin, direction } = this.raycaster.ray;
		const ground = rayPlaneIntersection([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z], 0);
		const [w, d] = [this.opts.workplaneWidth / 2, this.opts.workplaneDepth / 2];
		return ground && Math.abs(ground[0]) <= w && Math.abs(ground[1]) <= d ? { point: [ground[0], ground[1], 0], normal: [0, 0, 1] } : null;
	}

	/** The shape under a screen position, or null. */
	pickNode(clientX: number, clientY: number): NodeId | null {
		return this.aim(clientX, clientY) ? this.designScene.pick(this.raycaster) : null;
	}

	dispose(): void {
		cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		this.canvas.removeEventListener('pointermove', this.onPointerMove);
		this.canvas.removeEventListener('pointerup', this.onPointerUp);
		this.canvas.removeEventListener('pointercancel', this.onPointerUp);
		this.canvas.removeEventListener('wheel', this.onWheel);
		this.canvas.removeEventListener('contextmenu', this.onContextMenu);
		this.designScene.dispose();
		this.scene.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
				obj.geometry.dispose();
				const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
				for (const m of materials) m.dispose();
			}
		});
		this.renderer.dispose();
		this.canvas.remove();
	}

	/** Points the raycaster through a screen position. False if the canvas has no size. */
	private aim(clientX: number, clientY: number): boolean {
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return false;
		const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
		this.raycaster.setFromCamera(ndc, this.rig.active);
		return true;
	}

	private requestRender = (): void => {
		if (this.frame) return;
		this.frame = requestAnimationFrame(this.tick);
	};

	private tick = (now: number): void => {
		this.frame = 0;
		this.rig.advance(now);
		this.renderer.render(this.scene, this.rig.active);
		if (this.rig.isAnimating) this.requestRender();
	};

	private resize(): void {
		const { clientWidth: w, clientHeight: h } = this.host;
		if (w === 0 || h === 0) return;
		this.renderer.setSize(w, h, false);
		this.rig.resize(w, h);
	}

	private onPointerDown = (e: PointerEvent): void => {
		if (e.pointerType === 'touch') {
			this.touchDown(e);
			return;
		}
		if (e.button === 0) {
			this.beginLeftPress(e);
			return;
		}
		// Right orbits (shift pans), middle pans.
		const mode = e.button === 2 ? (e.shiftKey ? 'pan' : 'orbit') : e.button === 1 ? 'pan' : null;
		if (!mode) return;
		e.preventDefault();
		this.canvas.setPointerCapture(e.pointerId);
		this.cameraDrag = { mode, x: e.clientX, y: e.clientY };
	};

	private onPointerMove = (e: PointerEvent): void => {
		if (e.pointerType === 'touch') {
			this.touchMove(e);
			return;
		}
		if (this.left) {
			this.moveLeftPress(e);
			return;
		}
		if (!this.cameraDrag) return;
		const dx = e.clientX - this.cameraDrag.x;
		const dy = e.clientY - this.cameraDrag.y;
		this.cameraDrag.x = e.clientX;
		this.cameraDrag.y = e.clientY;
		if (this.cameraDrag.mode === 'orbit') this.rig.orbitBy(dx, dy);
		else this.rig.panBy(dx, dy);
	};

	private onPointerUp = (e: PointerEvent): void => {
		if (e.pointerType === 'touch') {
			this.touchUp(e);
			return;
		}
		if (this.left && e.button === 0) this.endLeftPress(e);
		else if (this.cameraDrag) this.cameraDrag = null;
		else return;
		if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
	};

	private touchDown(e: PointerEvent): void {
		e.preventDefault();
		this.canvas.setPointerCapture(e.pointerId);
		this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.fingers.size === 1) {
			this.beginLeftPress(e);
			return;
		}
		if (this.fingers.size === 2) {
			this.abandonLeftPress();
			this.pinch = [...this.fingers.values()] as [Point, Point];
		}
	}

	private touchMove(e: PointerEvent): void {
		if (!this.fingers.has(e.pointerId)) return;
		this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (this.pinch) {
			if (this.fingers.size !== 2) return;
			const now = [...this.fingers.values()] as [Point, Point];
			const step = twoFingerStep(this.pinch, now);
			this.pinch = now;
			this.rig.panBy(step.pan[0], step.pan[1]);
			if (step.zoom !== 1) this.rig.zoomBy(step.zoom);
		} else if (this.left) {
			this.moveLeftPress(e);
		}
	}

	private touchUp(e: PointerEvent): void {
		if (!this.fingers.delete(e.pointerId)) return;
		if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
		if (this.pinch) {
			// With one finger left there is nothing to do until it is lifted too.
			if (this.fingers.size < 2) this.pinch = null;
		} else if (this.left) {
			this.endLeftPress(e);
		}
	}

	/** Stops a one-finger press that turned into a two-finger gesture, keeping any move made so far. */
	private abandonLeftPress(): void {
		const press = this.left;
		this.left = null;
		if (press?.mode === 'move') this.opts.onMoveEnd();
		else if (press?.mode === 'marquee') this.opts.onMarqueeRect(null);
	}

	private beginLeftPress(e: PointerEvent): void {
		const id = this.surfaceToolOn ? null : this.pickNode(e.clientX, e.clientY);
		const additive = e.shiftKey || this.multiSelectOn;
		if (e.pointerType !== 'touch') this.canvas.setPointerCapture(e.pointerId);
		if (!this.surfaceToolOn) this.opts.onPick(id, additive, 'down');
		const node = id !== null ? this.design?.nodes[id] : undefined;
		const planeZ = node ? translationOf(node.transform)[2] : 0;
		this.left = {
			id,
			additive,
			startX: e.clientX,
			startY: e.clientY,
			planeZ,
			startGround: this.pickWorkplane(e.clientX, e.clientY, planeZ),
			mode: null,
			touch: e.pointerType === 'touch',
			lastX: e.clientX,
			lastY: e.clientY,
		};
	}

	private moveLeftPress(e: PointerEvent): void {
		const press = this.left!;
		if (!press.mode && !this.beginDrag(press, e)) return;
		this.continueDrag(press, e);
		press.lastX = e.clientX;
		press.lastY = e.clientY;
	}

	/** Once the pointer has travelled far enough, decides what the press has become. False while it is still a click. */
	private beginDrag(press: LeftPress, e: PointerEvent): boolean {
		if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD) return false;
		press.mode = dragModeFor(press, this.surfaceToolOn, this.multiSelectOn, this.toolPaintsOnDrag);
		if (press.mode === 'move') this.opts.onMoveStart();
		return true;
	}

	private continueDrag(press: LeftPress, e: PointerEvent): void {
		if (press.mode === 'move') {
			const ground = this.pickWorkplane(e.clientX, e.clientY, press.planeZ);
			if (ground && press.startGround) this.opts.onMove([ground[0] - press.startGround[0], ground[1] - press.startGround[1]]);
		} else if (press.mode === 'marquee') {
			this.opts.onMarqueeRect(this.marqueeRect(press, e));
		} else if (press.mode === 'orbit') {
			this.rig.orbitBy(e.clientX - press.lastX, e.clientY - press.lastY);
		}
	}

	private endLeftPress(e: PointerEvent): void {
		const press = this.left!;
		this.left = null;
		if (press.mode === 'move') {
			this.opts.onMoveEnd();
		} else if (press.mode === 'marquee') {
			this.opts.onMarqueeRect(null);
			const rect = this.canvas.getBoundingClientRect();
			const r = this.marqueeRect(press, e);
			const toNdcX = (px: number) => (px / rect.width) * 2 - 1;
			const toNdcY = (px: number) => -((px / rect.height) * 2 - 1);
			const ids = this.designScene.idsInRect(this.rig.active, {
				minX: toNdcX(r.x),
				maxX: toNdcX(r.x + r.width),
				minY: toNdcY(r.y + r.height),
				maxY: toNdcY(r.y),
			});
			this.opts.onMarquee(ids, press.additive);
		} else if (press.mode === null && !this.surfaceToolOn) {
			this.opts.onPick(press.id, press.additive, 'click');
		}
	}

	private marqueeRect(press: LeftPress, e: PointerEvent): PixelRect {
		const rect = this.canvas.getBoundingClientRect();
		const x0 = Math.min(press.startX, e.clientX) - rect.left;
		const y0 = Math.min(press.startY, e.clientY) - rect.top;
		return { x: x0, y: y0, width: Math.abs(e.clientX - press.startX), height: Math.abs(e.clientY - press.startY) };
	}

	private onWheel = (e: WheelEvent): void => {
		e.preventDefault();
		this.rig.zoomBy(Math.exp(e.deltaY * WHEEL_RATE));
	};

	private onContextMenu = (e: Event): void => e.preventDefault();
}
