import {
	chamferedMesh,
	chamferOf,
	countersinkOf,
	countersunkMesh,
	type DesignNode,
	type EdgeTreatment,
	edgeIsPresent,
	isMirrored,
	MESH_SHAPE_TYPE,
	type MeshData,
	mirrorMeshX,
	type NodeId,
	type PaintedMesh,
	type PaintFill,
	paintTriangles,
	parametricShape,
	type ShapeNode,
	sharpEdges,
	unitSolidMesh,
	type Vec3,
} from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { treatmentCuts } from './edgeCut.ts';
import { textSolid } from './textSolid.ts';
import type { GroupMesh } from './types.ts';

/** manifold wants a 16-number tuple; a node's transform is the same column-major matrix as a plain array. */
type ManifoldMat4 = Parameters<Manifold['transform']>[0];
const asMat4 = (m: readonly number[]) => m as unknown as ManifoldMat4;

/** Facets around a cylinder, and the detail of a sphere. */
const CYLINDER_SEGMENTS = 64;
const SPHERE_SEGMENTS = 48;

type Nodes = { nodes: Record<NodeId, DesignNode> };

/** The stored meshes of imported models, by reference (see `meshRefsIn`). */
export type MeshTable = ReadonlyMap<string, MeshData>;

/**
 * Works out the single mesh a group makes: its solids joined together, minus its holes. The
 * result is in the group's own frame (the group's own transform is not applied, so moving a
 * group never means recomputing it). A single shape (one with treated edges, drawn on its own) is
 * likewise worked out in its own frame. Returns null when nothing is left, or for a missing node.
 *
 * manifold objects live in WASM memory and must be freed by hand, so every one created here is
 * tracked and deleted before returning, however it returns.
 */
export function evaluateGroup(M: ManifoldToplevel, design: Nodes, groupId: NodeId, meshes?: MeshTable): GroupMesh | null {
	return build(M, design, groupId, false, meshes);
}

/**
 * Like evaluateGroup, but for any top-level shape or group, and placed where it is in the design:
 * the node's own transform is applied. This is what gets exported. Null when there is nothing to build.
 */
export function evaluateNode(M: ManifoldToplevel, design: Nodes, id: NodeId, meshes?: MeshTable): GroupMesh | null {
	return build(M, design, id, true, meshes);
}

function build(M: ManifoldToplevel, design: Nodes, rootId: NodeId, placeRoot: boolean, meshes?: MeshTable): GroupMesh | null {
	const evaluation = new Evaluation(M, design, meshes);
	try {
		return evaluation.run(rootId, placeRoot);
	} finally {
		evaluation.free();
	}
}

/**
 * One evaluation of a node. manifold objects live in WASM memory and must be freed by hand, so every one
 * created here is tracked and deleted by `free()`, however the evaluation ends.
 */
class Evaluation {
	private readonly owned: Manifold[] = [];
	/** Edge treatments left out because their edge is gone. */
	private readonly skipped: string[] = [];

	constructor(
		private readonly M: ManifoldToplevel,
		private readonly design: Nodes,
		private readonly meshes?: MeshTable,
	) {}

	run(rootId: NodeId, placeRoot: boolean): GroupMesh | null {
		const root = this.design.nodes[rootId];
		// A painted node is built in its own frame (that is where the paint is stored) and placed afterwards by hand, so the triangles keep their order.
		const fills = root && root.kind !== 'mesh' && root.mode === 'solid' ? root.paint : undefined;
		const painted = (fills?.length ?? 0) > 0;
		const result = this.built(root, placeRoot && !painted);
		const built = result && !result.isEmpty() ? toGroupMesh(result) : null;
		const mesh = built && painted ? paintedMesh(built, fills!, placeRoot ? root!.transform : null) : built;
		return mesh && this.skipped.length ? { ...mesh, skippedEdges: [...this.skipped] } : mesh;
	}

	/** The manifold of a top-level node, placed where it is or in its own frame. */
	private built(root: DesignNode | undefined, place: boolean): Manifold | null {
		if (root?.kind === 'group') return place ? this.placed(root.id) : this.contents(root.id);
		if (root?.kind === 'shape') return place ? this.shape(root) : this.treated(this.primitive(root), root.edges);
		return null;
	}

	free(): void {
		for (const m of this.owned) {
			try {
				m.delete();
			} catch {
				// Already freed (the same object was tracked twice); nothing to do.
			}
		}
	}

	private track(m: Manifold): Manifold {
		this.owned.push(m);
		return m;
	}

	/** An imported model as a manifold, in the unit box. Fails with a message fit to show if it cannot be cut. */
	private imported(node: ShapeNode): Manifold {
		const data = this.meshes?.get(String(node.params.mesh));
		if (!data) throw new Error(`The model data for "${node.name}" is missing`);
		try {
			const shown = isMirrored(node) ? mirrorMeshX(data) : data; // a flipped model is the mirror image of the one stored
			const mesh = new this.M.Mesh({ numProp: 3, vertProperties: shown.positions, triVerts: shown.indices });
			return this.track(this.M.Manifold.ofMesh(mesh));
		} catch {
			throw new Error(`"${node.name}" is not watertight (its surface has holes or overlaps), so it cannot be used to cut or be cut`);
		}
	}

	/** A shape's own geometry: base on z = 0 and scaled to its size, before it is placed. */
	private primitive(node: ShapeNode): Manifold {
		const { width, depth, height } = node.params as { width: number; depth: number; height: number };
		const { Manifold } = this.M;
		const size: [number, number, number] = [width, depth, height];
		const sink = countersinkOf(node);
		if (sink) {
			// A flared hole is not convex, so it is built from its mesh (a closed solid facing outwards) rather than as a hull.
			const mesh = countersunkMesh(width, depth, height, sink.size, sink.end, CYLINDER_SEGMENTS);
			return this.track(Manifold.ofMesh(new this.M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices })));
		}
		const chamfer = chamferOf(node);
		if (chamfer) {
			// Chamfered boxes and cylinders are convex, so the hull of their points is exactly the shape.
			const mesh = chamferedMesh(
				node.shapeType as 'box' | 'cylinder',
				width,
				depth,
				height,
				chamfer.size,
				chamfer.edges,
				CYLINDER_SEGMENTS,
			);
			const points: [number, number, number][] = [];
			for (let i = 0; i < mesh.positions.length; i += 3) points.push([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!]);
			return this.track(Manifold.hull(points));
		}
		// a shape built from its settings (a tube's wall, a ring's thickness) is already at its real size: no stretching
		const built = parametricShape(node);
		if (built) {
			const mesh = new this.M.Mesh({ numProp: 3, vertProperties: built.positions, triVerts: built.indices });
			return this.track(Manifold.ofMesh(mesh));
		}
		const solid = unitSolidMesh(node.shapeType);
		if (solid) {
			// the basic solids (cone, wedge, roof...) are a unit mesh stretched to size; it faces outwards and is closed
			const mesh = new this.M.Mesh({ numProp: 3, vertProperties: solid.positions, triVerts: solid.indices });
			return this.track(this.track(Manifold.ofMesh(mesh)).scale(size));
		}
		switch (node.shapeType) {
			case MESH_SHAPE_TYPE:
				return this.track(this.imported(node).scale(size));
			case 'text':
				return this.track(textSolid(this.M, node)); // the letters, already at the shape's size
			case 'cylinder':
				return this.track(this.track(Manifold.cylinder(1, 0.5, 0.5, CYLINDER_SEGMENTS, false)).scale(size));
			case 'sphere':
				return this.track(this.track(this.track(Manifold.sphere(0.5, SPHERE_SEGMENTS)).translate([0, 0, 0.5])).scale(size));
			default:
				return this.track(this.track(Manifold.cube(size, false)).translate([-width / 2, -depth / 2, 0]));
		}
	}

	/** A shape as a manifold: its geometry with any edge treatments, then placed by its own transform. */
	private shape(node: ShapeNode): Manifold {
		return this.track(this.treated(this.primitive(node), node.edges).transform(asMat4(node.transform)));
	}

	/**
	 * `base` with its edge treatments cut (chamfers, rounds), in the frame they were stored in. A treatment whose edge is no longer
	 * one of `base`'s sharp edges is skipped and reported, never cut blindly.
	 */
	private treated(base: Manifold, edges: readonly EdgeTreatment[] | undefined): Manifold {
		if (!edges?.length) return base;
		const mesh = toGroupMesh(base);
		const found = mesh ? sharpEdges(mesh) : [];
		const pieces: Manifold[] = [];
		for (const treatment of edges) {
			if (!edgeIsPresent(found, treatment)) {
				this.skipped.push(treatment.id);
				continue;
			}
			// All of one treatment's wedges together, minus all of its tubes together: taking each tube only from its own wedge would
			// cut away what the neighbouring tube keeps, leaving paper-thin walls at every joint along a curved edge.
			const wedges: Manifold[] = [];
			const tubes: Manifold[] = [];
			for (const cut of treatmentCuts(treatment)) {
				wedges.push(this.track(this.M.Manifold.hull(cut.prism)));
				if (cut.keep) tubes.push(this.cylinder(cut.keep.from, cut.keep.to, cut.keep.radius));
			}
			if (wedges.length === 0) continue;
			const wedge = this.track(this.M.Manifold.union(wedges));
			pieces.push(tubes.length ? this.track(wedge.subtract(this.track(this.M.Manifold.union(tubes)))) : wedge);
		}
		return pieces.length ? this.track(base.subtract(this.track(this.M.Manifold.union(pieces)))) : base;
	}

	/** A round cylinder from one point to another. */
	private cylinder(from: Vec3, to: Vec3, radius: number): Manifold {
		const axis: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
		const length = Math.hypot(...axis);
		const w = axis.map((v) => v / length) as Vec3;
		// any direction square to the axis, then a third square to both
		const pick: Vec3 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
		const u0: Vec3 = [w[1] * pick[2] - w[2] * pick[1], w[2] * pick[0] - w[0] * pick[2], w[0] * pick[1] - w[1] * pick[0]];
		const u = u0.map((v) => v / Math.hypot(...u0)) as Vec3;
		const v: Vec3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
		const placed = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, w[0], w[1], w[2], 0, from[0], from[1], from[2], 1];
		const unitCylinder = this.track(this.M.Manifold.cylinder(length, radius, radius, CYLINDER_SEGMENTS, false));
		return this.track(unitCylinder.transform(asMat4(placed)));
	}

	/** What a child of a group contributes (null for anything that makes no solid), and whether it cuts. */
	private child(childId: NodeId): { manifold: Manifold; isHole: boolean } | null {
		const child = this.design.nodes[childId];
		if (!child) return null;
		const manifold = child.kind === 'shape' ? this.shape(child) : child.kind === 'group' ? this.placed(childId) : null;
		return manifold ? { manifold, isHole: child.mode === 'hole' } : null;
	}

	/** A group's contents: solids joined, holes cut out. Null when there is nothing solid left. */
	private contents(id: NodeId): Manifold | null {
		const group = this.design.nodes[id];
		if (group?.kind !== 'group') return null;

		const solids: Manifold[] = [];
		const holes: Manifold[] = [];
		for (const childId of group.children) {
			if (this.design.nodes[childId]?.hidden) continue; // a hidden part is not drawn or exported, and a hidden hole does not cut
			const built = this.child(childId);
			if (built) (built.isHole ? holes : solids).push(built.manifold);
		}
		if (solids.length === 0) return null;

		const { Manifold } = this.M;
		const joined = this.track(group.op === 'intersect' ? Manifold.intersection(solids) : Manifold.union(solids));
		const cut = holes.length === 0 ? joined : this.track(joined.subtract(this.track(Manifold.union(holes))));
		return this.treated(cut, group.edges);
	}

	/** A nested group as seen from its parent: its contents, moved by its own transform. */
	private placed(id: NodeId): Manifold | null {
		const inner = this.contents(id);
		return inner ? this.track(inner.transform(asMat4(this.design.nodes[id]!.transform))) : null;
	}
}

/** `mesh` with its paint worked out (in its own frame) and then, if `transform` is given, placed by hand so the triangles keep their order. */
function paintedMesh(mesh: GroupMesh, fills: readonly PaintFill[], transform: readonly number[] | null): GroupMesh {
	const paint = paintTriangles(mesh, fills);
	// a brush cuts the surface finer, and the paint belongs to that mesh
	const { mesh: cut, ...painting } = paint ?? {};
	const base = cut ? { ...mesh, ...cut } : mesh;
	const withPaint = paint ? { ...base, paint: painting as PaintedMesh } : base;
	return transform ? { ...withPaint, positions: transformPositions(base.positions, transform) } : withPaint;
}

/** `positions` moved by a column-major 4x4 transform (rotation and position only, so the triangles keep their winding). */
function transformPositions(positions: Float32Array, m: readonly number[]): Float32Array {
	const out = new Float32Array(positions.length);
	for (let i = 0; i < positions.length; i += 3) {
		const [x, y, z] = [positions[i]!, positions[i + 1]!, positions[i + 2]!];
		for (let r = 0; r < 3; r++) out[i + r] = m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!;
	}
	return out;
}

/** The positions and triangles of a built manifold, or null if it has no triangles. */
function toGroupMesh(result: Manifold): GroupMesh | null {
	const mesh = result.getMesh();
	if (mesh.triVerts.length === 0) return null;

	// Vertices may carry extra properties after xyz; keep only the positions.
	const stride = mesh.numProp;
	const vertices = mesh.vertProperties.length / stride;
	const positions = new Float32Array(vertices * 3);
	for (let v = 0; v < vertices; v++) {
		positions[v * 3] = mesh.vertProperties[v * stride]!;
		positions[v * 3 + 1] = mesh.vertProperties[v * stride + 1]!;
		positions[v * 3 + 2] = mesh.vertProperties[v * stride + 2]!;
	}
	return { positions, indices: Uint32Array.from(mesh.triVerts) };
}
