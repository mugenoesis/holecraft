import { CHAMFER_CYLINDER_SEGMENTS, ellipseOutline, loft } from './chamfer.ts';
import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import type { MeshData } from './meshShape.ts';

/**
 * Countersunk holes (the rest of Stage A of chamfers): a cylinder set to Hole can flare its entrance, at the top, the bottom or
 * both, so a screw head sits flush. The flare is 45 degrees and its size is how far the opening widens on every side, the same
 * measure as a chamfer. Stored as `params.countersink` (mm) and `params.countersinkEnd`, so no format change.
 *
 * A flared cylinder is not convex, so it is not a hull like a chamfered shape; it is the same stack of horizontal rings, joined
 * by quads and capped, and that one mesh is drawn in the view and handed to the CSG engine.
 */

export type CountersinkEnd = 'top' | 'bottom' | 'both';
export const COUNTERSINK_ENDS: readonly CountersinkEnd[] = ['top', 'bottom', 'both'];

/** A hole's effective countersink: the size limited to what fits, and which end. Null when it has none (or isn't a cylinder hole). */
export function countersinkOf(node: ShapeNode): { size: number; end: CountersinkEnd } | null {
	const { countersink, countersinkEnd, height } = node.params as Record<string, unknown>;
	if (node.shapeType !== 'cylinder' || node.mode !== 'hole' || typeof countersink !== 'number' || !(countersink > 0)) return null;
	const end = COUNTERSINK_ENDS.includes(countersinkEnd as CountersinkEnd) ? (countersinkEnd as CountersinkEnd) : 'top';
	// A flare may be as long as the hole; with a flare at both ends each gets half, so they meet at the middle at most.
	return { size: Math.min(countersink, Number(height) / (end === 'both' ? 2 : 1)), end };
}

/** The mesh of a cylinder hole at its real size (mm), base centre at the origin, with its flare(s). */
export function countersunkMesh(
	width: number,
	depth: number,
	height: number,
	size: number,
	end: CountersinkEnd,
	segments = CHAMFER_CYLINDER_SEGMENTS,
): MeshData {
	const [x, y] = [width / 2, depth / 2];
	const wide = (z: number) => ({ z, x: x + size, y: y + size, cut: 0 });
	const plain = (z: number) => ({ z, x, y, cut: 0 });
	const slices = [end === 'top' ? plain(0) : wide(0), plain(size), plain(height - size), end === 'bottom' ? plain(height) : wide(height)];
	// a slice at the same height as the one before (a flare as long as the hole) would make flat, zero-height faces: leave it out
	const kept = slices.filter((r, i) => i === 0 || r.z !== slices[i - 1]!.z);
	return loft(
		kept.map((r) => ellipseOutline(r, segments)),
		kept.map((r) => r.z),
	);
}

/**
 * Sets a cylinder hole's countersink: `size` in mm (0 removes it and its end choice) and/or which `end` it flares. The size is
 * stored as typed and limited to what fits only when built, as with a chamfer.
 */
export function setShapeCountersink(design: Design, id: NodeId, change: { size?: number; end?: CountersinkEnd }, now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'shape' || node.locked || node.shapeType !== 'cylinder') return design;
	const { size, end } = change;
	if (size !== undefined && !(Number.isFinite(size) && size >= 0 && size <= MAX_SHAPE_SIZE)) return design;
	if (end !== undefined && !COUNTERSINK_ENDS.includes(end)) return design;

	const params = { ...node.params };
	if (size === 0) {
		delete params.countersink;
		delete params.countersinkEnd;
	} else {
		if (size !== undefined) params.countersink = size;
		if (end !== undefined) params.countersinkEnd = end;
	}
	const keys = new Set([...Object.keys(params), ...Object.keys(node.params)]);
	if ([...keys].every((k) => params[k] === node.params[k])) return design;
	return { ...design, nodes: { ...design.nodes, [id]: { ...node, params } }, updatedAt: (now ?? new Date()).toISOString() };
}
