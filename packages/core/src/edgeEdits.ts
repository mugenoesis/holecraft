import type { Vec3 } from './camera.ts';
import type { Design, DesignNode, EdgeTreatment, NodeId } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';

/** Edits to a node's edge treatments (the Edge tool). Like every edit, the same design comes back when nothing changes. */

const stamp = (now?: Date) => (now ?? new Date()).toISOString();

function withEdges(design: Design, node: DesignNode, edges: readonly EdgeTreatment[], now?: Date): Design {
	const next = { ...node };
	if (edges.length) next.edges = [...edges];
	else delete next.edges;
	return { ...design, nodes: { ...design.nodes, [node.id]: next }, updatedAt: stamp(now) };
}

const sameList = (a: readonly EdgeTreatment[] | undefined, b: readonly EdgeTreatment[]) => JSON.stringify(a ?? []) === JSON.stringify(b);

/** Replaces a node's edge treatments (an empty list removes them). Refused for locked nodes, bad sizes and repeated ids. */
export function setEdgeTreatments(design: Design, id: NodeId, edges: readonly EdgeTreatment[], now?: Date): Design {
	const node = design.nodes[id];
	if (!node || node.locked || node.kind === 'mesh') return design;
	if (!edges.every((t) => Number.isFinite(t.size) && t.size > 0 && t.size <= MAX_SHAPE_SIZE)) return design;
	if (new Set(edges.map((t) => t.id)).size !== edges.length) return design;
	return sameList(node.edges, edges) ? design : withEdges(design, node, edges, now);
}

/** Removes the treatments with these ids from a node (for example ones whose edge an edit has removed). */
export function removeEdgeTreatments(design: Design, id: NodeId, ids: readonly string[], now?: Date): Design {
	const node = design.nodes[id];
	if (!node?.edges) return design;
	const kept = node.edges.filter((t) => !ids.includes(t.id));
	return kept.length === node.edges.length ? design : setEdgeTreatments(design, id, kept, now);
}

/**
 * The treatments after the shape they are on is stretched by `factors` along its axes (and moved by `shift`, if given): the
 * edges go where the stretched edges are, and the face directions turn the way a stretched surface does (by the inverse of the
 * stretch, back to length 1). Sizes stay as they are: a 2 mm chamfer is still 2 mm. The same list comes back when nothing changes.
 */
export function stretchTreatments(
	edges: readonly EdgeTreatment[] | undefined,
	factors: Vec3,
	shift: Vec3 | null,
): EdgeTreatment[] | undefined {
	if (!edges) return undefined;
	const moves = shift !== null && shift.some((v) => v !== 0);
	if (!moves && factors.every((f) => f === 1)) return edges as EdgeTreatment[];
	const point = (p: Vec3): Vec3 => [0, 1, 2].map((k) => factors[k]! * p[k]! + (shift ? shift[k]! : 0)) as Vec3;
	const direction = (n: Vec3): Vec3 => {
		const raw = [0, 1, 2].map((k) => n[k]! / factors[k]!);
		const length = Math.hypot(...(raw as [number, number, number]));
		return raw.map((v) => v / length) as Vec3;
	};
	return edges.map((t) => ({
		...t,
		points: t.points.map(point),
		normals: t.normals.map(([a, b]) => [direction(a), direction(b)] as [Vec3, Vec3]),
	}));
}
