import {
	applyViewPreset,
	type Design,
	designBounds,
	fitToBounds,
	HOME_VIEW,
	type MeshData,
	type NodeId,
	type OrbitState,
	rayAnyPlaneIntersection,
	rayPlaneIntersection,
	rayVerticalPlaneIntersection,
	translationOf,
	type Vec3,
	type ViewPresetName,
} from '@holecraft/core';
import * as THREE from 'three';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { CameraRig, FOV_DEG, type Projection } from './CameraRig.ts';
import { DesignScene } from './DesignScene.ts';
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
		this.designScene.sync(design, results, failed, meshes);
		this.requestRender();
	}

	setSelection(ids: readonly NodeId[]): void {
		this.designScene.setSelection(ids);
		this.requestRender();
	}

	home(): void {
		this.rig.goTo(HOME_VIEW);
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
			try {
				this.designScene.withoutSelection(() => renderer.render(this.scene, camera));
			} finally {
				if (this.workplane) this.workplane.visible = true;
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
		const id = this.pickNode(e.clientX, e.clientY);
		const additive = e.shiftKey;
		if (e.pointerType !== 'touch') this.canvas.setPointerCapture(e.pointerId);
		this.opts.onPick(id, additive, 'down');
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
		if (!press.mode) {
			if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD) return;
			// Shift-pressing a shape only toggles it; it doesn't start a move.
			press.mode = press.id === null ? (press.touch ? 'orbit' : 'marquee') : press.additive ? 'none' : 'move';
			if (press.mode === 'move') this.opts.onMoveStart();
		}
		if (press.mode === 'move') {
			const ground = this.pickWorkplane(e.clientX, e.clientY, press.planeZ);
			if (ground && press.startGround) this.opts.onMove([ground[0] - press.startGround[0], ground[1] - press.startGround[1]]);
		} else if (press.mode === 'marquee') {
			this.opts.onMarqueeRect(this.marqueeRect(press, e));
		} else if (press.mode === 'orbit') {
			this.rig.orbitBy(e.clientX - press.lastX, e.clientY - press.lastY);
		}
		press.lastX = e.clientX;
		press.lastY = e.clientY;
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
		} else if (press.mode === null) {
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
