import {
	chamferedMesh,
	chamferOf,
	countersinkOf,
	countersunkMesh,
	type DesignNode,
	type EdgeTreatment,
	edgeIsPresent,
	MESH_SHAPE_TYPE,
	type MeshData,
	type NodeId,
	type ShapeNode,
	sharpEdges,
	unitSolidMesh,
	type Vec3,
} from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { treatmentCuts } from './edgeCut.ts';
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
		let result: Manifold | null = null;
		if (root?.kind === 'group') result = placeRoot ? this.placed(rootId) : this.contents(rootId);
		else if (root?.kind === 'shape') result = placeRoot ? this.shape(root) : this.treated(this.primitive(root), root.edges);
		const mesh = result && !result.isEmpty() ? toGroupMesh(result) : null;
		return mesh && this.skipped.length ? { ...mesh, skippedEdges: [...this.skipped] } : mesh;
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
			const mesh = new this.M.Mesh({ numProp: 3, vertProperties: data.positions, triVerts: data.indices });
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
		const solid = unitSolidMesh(node.shapeType);
		if (solid) {
			// the basic solids (cone, wedge, roof...) are a unit mesh stretched to size; it faces outwards and is closed
			const mesh = new this.M.Mesh({ numProp: 3, vertProperties: solid.positions, triVerts: solid.indices });
			return this.track(this.track(Manifold.ofMesh(mesh)).scale(size));
		}
		switch (node.shapeType) {
			case MESH_SHAPE_TYPE:
				return this.track(this.imported(node).scale(size));
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
			for (const cut of treatmentCuts(treatment)) {
				const prism = this.track(this.M.Manifold.hull(cut.prism));
				pieces.push(cut.keep ? this.track(prism.subtract(this.cylinder(cut.keep.from, cut.keep.to, cut.keep.radius))) : prism);
			}
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
