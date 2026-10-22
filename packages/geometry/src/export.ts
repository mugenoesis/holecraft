import type { DesignNode, NodeId } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { evaluateNode, type MeshTable } from './evaluate.ts';
import type { GroupMesh } from './types.ts';

export { evaluateNode } from './evaluate.ts';

/** One printable body: a top-level shape or group, in world coordinates (mm, Z up). */
export interface CollectOptions {
	/** Cut every body off at the workplane (z = 0), leaving only what is at or above it. A body wholly underground is left out. */
	cutBelowPlane?: boolean;
}

export interface ExportBody {
	name: string;
	/** #rrggbb */
	color: string;
	mesh: GroupMesh;
}

/** The lowest point of a mesh (z). */
const lowestZ = (mesh: GroupMesh): number => {
	let lowest = Number.POSITIVE_INFINITY;
	for (let i = 2; i < mesh.positions.length; i += 3) lowest = Math.min(lowest, mesh.positions[i]!);
	return lowest;
};

/**
 * The part of a body at or above the workplane, or null when none of it is. A body that is already wholly above comes back as it is
 * (painting and all); a cut body loses its painting, since the cut changes which triangles there are.
 */
function cutAtPlane(M: ManifoldToplevel, mesh: GroupMesh): GroupMesh | null {
	if (lowestZ(mesh) >= -1e-6) return mesh;
	const whole = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
	const cut = whole.trimByPlane([0, 0, 1], 0);
	try {
		const out = cut.getMesh();
		if (out.triVerts.length === 0) return null;
		const positions = new Float32Array((out.vertProperties.length / out.numProp) * 3);
		for (let v = 0; v < positions.length / 3; v++) {
			positions.set(out.vertProperties.subarray(v * out.numProp, v * out.numProp + 3), v * 3);
		}
		return { positions, indices: Uint32Array.from(out.triVerts) };
	} finally {
		whole.delete();
		cut.delete();
	}
}

/**
 * Everything that would be printed: each visible top-level solid shape or group, with its holes
 * cut out and its place in the design applied. Holes, hidden things and anything the holes cut away
 * completely are left out. Bodies keep the order of the design.
 */
export function collectBodies(
	M: ManifoldToplevel,
	design: { nodes: Record<NodeId, DesignNode>; roots: NodeId[] },
	meshes?: MeshTable,
	options: CollectOptions = {},
): ExportBody[] {
	const bodies: ExportBody[] = [];
	for (const id of design.roots) {
		const node = design.nodes[id];
		if (!node || node.hidden || node.mode !== 'solid' || node.kind === 'mesh') continue;
		const whole = evaluateNode(M, design, id, meshes);
		const mesh = whole && options.cutBelowPlane ? cutAtPlane(M, whole) : whole;
		if (mesh) bodies.push({ name: node.name, color: node.color, mesh });
	}
	return bodies;
}
