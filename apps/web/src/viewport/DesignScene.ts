import {
	type Design,
	type GroupNode,
	MESH_SHAPE_TYPE,
	type MeshData,
	type NodeId,
	type ShapeNode,
	type ShapeType,
	type Vec3,
} from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GroupResult } from '../geometry/GeometryService.ts';

const SELECTED_TINT = 0x1f6f8b;
const OUTLINE_COLOR = 0x0f766e;
/** Holes are drawn as pale, see-through ghosts, whatever colour the shape itself has. */
const HOLE_COLOR = 0x8fa1b0;
const HOLE_OPACITY = 0.35;

/** Unit-sized geometry resting on z=0, scaled per shape by its width/depth/height. */
function createUnitGeometry(type: ShapeType): THREE.BufferGeometry {
	switch (type) {
		case 'box':
			return new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
		case 'cylinder':
			// three's cylinder runs along Y; stand it up along Z.
			return new THREE.CylinderGeometry(0.5, 0.5, 1, 64).rotateX(Math.PI / 2).translate(0, 0, 0.5);
		case 'sphere':
			return new THREE.SphereGeometry(0.5, 48, 32).rotateX(Math.PI / 2).translate(0, 0, 0.5);
	}
}

/** Screen-space rectangle in normalised device coordinates (-1..1, Y up). */
export interface NdcRect {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

const NO_RESULTS: ReadonlyMap<NodeId, GroupResult> = new Map();
const NO_FAILURES: ReadonlySet<NodeId> = new Set();
const NO_MESHES: ReadonlyMap<string, MeshData> = new Map();
/** Edges sharper than this stay crisp on a computed mesh; gentler ones are smoothed. */
const CREASE_ANGLE = Math.PI / 6;

interface PlaceContext {
	results: ReadonlyMap<NodeId, GroupResult>;
	failed: ReadonlySet<NodeId>;
	meshes: ReadonlyMap<string, MeshData>;
	live: Set<NodeId>;
	liveResults: Set<NodeId>;
}

const cornerCache = new WeakMap<THREE.BufferGeometry, THREE.Vector3[]>();

/** The eight corners of a mesh's own bounding box (local space), for screen-space marquee tests. */
function cornersOf(mesh: THREE.Mesh): THREE.Vector3[] {
	let corners = cornerCache.get(mesh.geometry);
	if (!corners) {
		mesh.geometry.computeBoundingBox();
		const { min, max } = mesh.geometry.boundingBox!;
		corners = [min.x, max.x].flatMap((x) => [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => new THREE.Vector3(x, y, z))));
		cornerCache.set(mesh.geometry, corners);
	}
	return corners;
}

/** A computed mesh as a geometry, with creased normals: boxes stay crisp, curved parts stay smooth. */
function buildResultGeometry(mesh: GroupMesh): THREE.BufferGeometry {
	const indexed = new THREE.BufferGeometry();
	indexed.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
	indexed.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
	const geometry = toCreasedNormals(indexed, CREASE_ANGLE);
	indexed.dispose();
	geometry.computeBoundingBox();
	return geometry;
}

const isShown = (obj: THREE.Object3D): boolean => {
	for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
	return true;
};

/**
 * Mirrors a Design into three.js objects: a mesh per shape and a THREE.Group per group, nested
 * like the document. Everything is keyed by node id, so `sync` is cheap to call after every
 * change and reuses objects when shapes are grouped, moved or ungrouped.
 *
 * Selection and picking work on top-level nodes: hitting any shape inside a group counts as
 * hitting the group.
 */
export class DesignScene {
	readonly root = new THREE.Group();

	private readonly geometries = new Map<ShapeType, THREE.BufferGeometry>();
	/** Geometry of imported models, one per stored mesh, shared by every shape that uses it. */
	private readonly modelGeometries = new Map<string, { source: MeshData; geometry: THREE.BufferGeometry }>();
	private readonly objects = new Map<NodeId, THREE.Object3D>();
	private readonly outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5));
	private readonly resultMeshes = new Map<NodeId, { mesh: THREE.Mesh; source: GroupMesh | null }>();
	private selection = new Set<NodeId>();

	constructor() {
		this.root.name = 'design';
	}

	/**
	 * Brings the scene in line with `design`. `results` holds the computed shape of top-level solid
	 * groups (see GeometryService): a group with one is drawn as that single mesh, and the shapes it
	 * was made from are hidden. A group with no result yet, or whose `failed`, shows its shapes
	 * as they are, holes as ghosts. `meshes` holds the stored models of imported shapes; until one has
	 * arrived its shape is drawn as a plain box of the right size.
	 */
	sync(
		design: Design,
		results: ReadonlyMap<NodeId, GroupResult> = NO_RESULTS,
		failed: ReadonlySet<NodeId> = NO_FAILURES,
		meshes: ReadonlyMap<string, MeshData> = NO_MESHES,
	): void {
		const live = new Set<NodeId>();
		const liveResults = new Set<NodeId>();
		const ctx: PlaceContext = { results, failed, meshes, live, liveResults };
		for (const id of design.roots) this.place(design, id, this.root, id, false, false, ctx);

		for (const [id, obj] of this.objects) {
			if (live.has(id)) continue;
			obj.parent?.remove(obj);
			if (obj instanceof THREE.Mesh) this.disposeMesh(obj);
			this.objects.delete(id);
		}
		for (const [id, entry] of this.resultMeshes) {
			if (liveResults.has(id)) continue;
			this.disposeResult(entry);
			this.resultMeshes.delete(id);
		}
	}

	/** Runs `fn` with nothing shown as selected (for pictures of the design), then puts the selection back. */
	withoutSelection<T>(fn: () => T): T {
		const kept = [...this.selection];
		this.setSelection([]);
		try {
			return fn();
		} finally {
			this.setSelection(kept);
		}
	}

	setSelection(ids: readonly NodeId[]): void {
		this.selection = new Set(ids);
		for (const mesh of this.meshes()) this.applySelection(mesh);
	}

	/** The top-level node nearest to the ray's origin that it hits (a group if a shape inside it is hit), or null. */
	pick(raycaster: THREE.Raycaster): NodeId | null {
		this.root.updateMatrixWorld(true);
		const candidates = this.meshes().filter(isShown);
		const [hit] = raycaster.intersectObjects(candidates, false);
		return hit ? (hit.object.userData.rootId as NodeId) : null;
	}

	/** Like `pick`, but also where the ray meets the surface (mm) and which way that surface faces (a unit vector). */
	pickHit(raycaster: THREE.Raycaster): { id: NodeId; point: Vec3; normal: Vec3 } | null {
		this.root.updateMatrixWorld(true);
		const [hit] = raycaster.intersectObjects(this.meshes().filter(isShown), false);
		if (!hit?.face) return null;
		const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
		return { id: hit.object.userData.rootId as NodeId, point: [hit.point.x, hit.point.y, hit.point.z], normal: [n.x, n.y, n.z] };
	}

	/** Top-level nodes with a visible shape whose on-screen bounding box overlaps `rect` (marquee selection). */
	idsInRect(camera: THREE.Camera, rect: NdcRect): NodeId[] {
		this.root.updateMatrixWorld(true);
		camera.updateMatrixWorld();
		const ids = new Set<NodeId>();
		const p = new THREE.Vector3();
		for (const mesh of this.meshes()) {
			if (!isShown(mesh)) continue;
			let minX = Infinity;
			let maxX = -Infinity;
			let minY = Infinity;
			let maxY = -Infinity;
			for (const corner of cornersOf(mesh)) {
				p.copy(corner).applyMatrix4(mesh.matrixWorld).project(camera);
				minX = Math.min(minX, p.x);
				maxX = Math.max(maxX, p.x);
				minY = Math.min(minY, p.y);
				maxY = Math.max(maxY, p.y);
			}
			if (maxX >= rect.minX && minX <= rect.maxX && maxY >= rect.minY && minY <= rect.maxY) ids.add(mesh.userData.rootId as NodeId);
		}
		return [...ids];
	}

	dispose(): void {
		for (const obj of this.objects.values()) if (obj instanceof THREE.Mesh) this.disposeMesh(obj);
		for (const entry of this.resultMeshes.values()) this.disposeResult(entry);
		for (const geometry of this.geometries.values()) geometry.dispose();
		for (const { geometry } of this.modelGeometries.values()) geometry.dispose();
		this.modelGeometries.clear();
		this.outlineGeometry.dispose();
		this.objects.clear();
		this.resultMeshes.clear();
		this.geometries.clear();
		this.root.clear();
	}

	/** Every mesh in the scene: the shapes, and the computed meshes of groups. */
	private meshes(): THREE.Mesh[] {
		const shapes = [...this.objects.values()].filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
		return [...shapes, ...[...this.resultMeshes.values()].map((r) => r.mesh)];
	}

	/**
	 * Creates or updates the object for a node and everything beneath it, under `parent`.
	 * `covered` means a computed mesh stands in for this node, so it must not be drawn or picked.
	 */
	private place(
		design: Design,
		id: NodeId,
		parent: THREE.Object3D,
		rootId: NodeId,
		ghost: boolean,
		covered: boolean,
		ctx: PlaceContext,
	): void {
		const node = design.nodes[id];
		if (!node || node.kind === 'mesh') return;
		ctx.live.add(id);

		const isHole = ghost || node.mode === 'hole';
		if (node.kind === 'group') this.placeGroup(design, node, parent, rootId, isHole, covered, ctx);
		else this.placeShape(node, parent, rootId, isHole, covered, ctx);
	}

	private placeGroup(
		design: Design,
		node: GroupNode,
		parent: THREE.Object3D,
		rootId: NodeId,
		isHole: boolean,
		covered: boolean,
		ctx: PlaceContext,
	): void {
		let obj = this.objects.get(node.id);
		if (!obj) {
			obj = new THREE.Group();
			obj.name = node.name;
			this.objects.set(node.id, obj);
		}
		this.applyTransform(obj, node.transform);
		obj.visible = !node.hidden;
		if (obj.parent !== parent) parent.add(obj);

		// Only a top-level solid group is drawn as a computed mesh; anything nested inside is part of it.
		const result = node.id === rootId && node.mode === 'solid' && !ctx.failed.has(node.id) ? ctx.results.get(node.id) : undefined;
		for (const childId of node.children) this.place(design, childId, obj, rootId, isHole, covered || result !== undefined, ctx);
		if (result) {
			ctx.liveResults.add(node.id);
			this.showResult(node.id, obj, node.color, result);
		}
	}

	private placeShape(node: ShapeNode, parent: THREE.Object3D, rootId: NodeId, isHole: boolean, covered: boolean, ctx: PlaceContext): void {
		let obj = this.objects.get(node.id);
		if (!obj) {
			obj = this.createMesh(node, ctx.meshes);
			this.objects.set(node.id, obj);
		}
		const mesh = obj as THREE.Mesh;
		const geometry = this.geometryForNode(node, ctx.meshes);
		if (mesh.geometry !== geometry) mesh.geometry = geometry; // an imported model has just arrived
		mesh.userData.rootId = rootId;
		this.applyTransform(mesh, node.transform);
		const { width, depth, height } = node.params as { width: number; depth: number; height: number };
		mesh.scale.set(width, depth, height);
		mesh.visible = !node.hidden && !covered;
		this.applyLook(mesh.material as THREE.MeshStandardMaterial, node.color, isHole);
		if (mesh.parent !== parent) parent.add(mesh);
		this.applySelection(mesh);
	}

	/** Draws a group's computed mesh inside its group object (so it moves with the group). */
	private showResult(id: NodeId, groupObject: THREE.Object3D, color: string, result: GroupResult): void {
		const existing = this.resultMeshes.get(id);

		if (!result.mesh) {
			// The holes cut everything away: nothing to draw.
			if (existing) {
				this.disposeResult(existing);
				this.resultMeshes.delete(id);
			}
			return;
		}

		let entry = existing;
		if (!entry) {
			const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
			mesh.userData = { nodeId: id, rootId: id, isResult: true };
			const outline = new THREE.LineSegments(this.outlineGeometry, new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }));
			outline.name = 'selection-outline';
			mesh.add(outline);
			entry = { mesh, source: null };
			this.resultMeshes.set(id, entry);
		}

		if (entry.source !== result.mesh) {
			const next = buildResultGeometry(result.mesh);
			entry.mesh.geometry.dispose();
			entry.mesh.geometry = next;
			entry.source = result.mesh;
			// The selection outline is the unit box (x, y in ±0.5, z in 0..1) stretched over the result.
			const box = next.boundingBox!;
			const outline = entry.mesh.getObjectByName('selection-outline')!;
			outline.scale.set(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
			outline.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);
		}

		(entry.mesh.material as THREE.MeshStandardMaterial).color.set(color);
		entry.mesh.visible = true;
		if (entry.mesh.parent !== groupObject) groupObject.add(entry.mesh);
		this.applySelection(entry.mesh);
	}

	private disposeResult(entry: { mesh: THREE.Mesh }): void {
		entry.mesh.parent?.remove(entry.mesh);
		entry.mesh.geometry.dispose();
		this.disposeMesh(entry.mesh);
	}

	private createMesh(node: ShapeNode, meshes: ReadonlyMap<string, MeshData>): THREE.Mesh {
		const mesh = new THREE.Mesh(this.geometryForNode(node, meshes), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
		mesh.userData.nodeId = node.id;
		const outline = new THREE.LineSegments(this.outlineGeometry, new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }));
		outline.name = 'selection-outline';
		mesh.add(outline);
		return mesh;
	}

	private applyTransform(obj: THREE.Object3D, transform: readonly number[]): void {
		new THREE.Matrix4().fromArray(transform).decompose(obj.position, obj.quaternion, obj.scale);
	}

	private applyLook(material: THREE.MeshStandardMaterial, color: string, hole: boolean): void {
		if (material.transparent !== hole) material.needsUpdate = true;
		material.transparent = hole;
		material.opacity = hole ? HOLE_OPACITY : 1;
		material.depthWrite = !hole;
		if (hole) material.color.setHex(HOLE_COLOR);
		else material.color.set(color);
	}

	private applySelection(mesh: THREE.Mesh): void {
		const selected = this.selection.has(mesh.userData.rootId as NodeId);
		const material = mesh.material as THREE.MeshStandardMaterial;
		material.emissive.set(selected ? SELECTED_TINT : 0x000000);
		material.emissiveIntensity = selected ? 0.35 : 1;
		const outline = mesh.getObjectByName('selection-outline');
		if (outline) outline.visible = selected;
	}

	private disposeMesh(mesh: THREE.Mesh): void {
		(mesh.material as THREE.Material).dispose();
		mesh.getObjectByName('selection-outline')?.traverse((o) => {
			if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
		});
	}

	private geometryForNode(node: ShapeNode, meshes: ReadonlyMap<string, MeshData>): THREE.BufferGeometry {
		if (node.shapeType !== MESH_SHAPE_TYPE) return this.geometryFor(node.shapeType as ShapeType);
		const ref = String(node.params.mesh);
		const data = meshes.get(ref);
		if (!data) return this.geometryFor('box'); // stand-in while the model downloads

		const known = this.modelGeometries.get(ref);
		if (known?.source === data) return known.geometry;
		known?.geometry.dispose();
		const geometry = buildResultGeometry(data);
		this.modelGeometries.set(ref, { source: data, geometry });
		return geometry;
	}

	private geometryFor(type: ShapeType): THREE.BufferGeometry {
		let geometry = this.geometries.get(type);
		if (!geometry) {
			geometry = createUnitGeometry(type);
			this.geometries.set(type, geometry);
		}
		return geometry;
	}
}
