import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import type { MeshData } from './meshShape.ts';

/**
 * Chamfered boxes and cylinders (Stage A of chamfers): a 45 degree bevel of a given size along all edges, only the top
 * edges, or only the bottom ones. Stored as \`params.chamfer\` (mm) and \`params.chamferEdges\`, so no format change.
 *
 * Both shapes are convex, so they are built as a loft: horizontal rings stacked from bottom to top, joined by quads and
 * capped at both ends. Every face is planar and the slices change linearly between rings, so the mesh is exact, and the
 * same mesh is drawn in the view and given to the CSG engine.
 */

export type ChamferEdges = 'all' | 'top' | 'bottom';
export const CHAMFER_EDGES: readonly ChamferEdges[] = ['all', 'top', 'bottom'];

/** Chamfers may come close to meeting but never meet, so no face shrinks to nothing. */
const MAX_FRACTION = 0.49;
/** Facets around a cylinder, as for an unchamfered one. */
export const CHAMFER_CYLINDER_SEGMENTS = 64;

const CHAMFERABLE = new Set(['box', 'cylinder']);

/** A shape's effective chamfer: the size limited to what fits, and which edges. Null when it has none. */
export function chamferOf(node: ShapeNode): { size: number; edges: ChamferEdges } | null {
	const { chamfer, chamferEdges, width, depth, height } = node.params as Record<string, unknown>;
	if (!CHAMFERABLE.has(node.shapeType) || typeof chamfer !== 'number' || !(chamfer > 0)) return null;
	const edges = CHAMFER_EDGES.includes(chamferEdges as ChamferEdges) ? (chamferEdges as ChamferEdges) : 'all';
	const [w, d, h] = [width, depth, height].map(Number) as [number, number, number];
	const limit = MAX_FRACTION * Math.min(w, d, edges === 'all' ? h : 2 * h);
	return { size: Math.min(chamfer, limit), edges };
}

/** One horizontal slice of the loft: half-sizes (or radii) and, for a box, how much each corner is cut off. */
interface Ring {
	z: number;
	x: number;
	y: number;
	cut: number;
}

/** The slices of a chamfered solid, bottom to top. \`c\` is the chamfer; \`corners\` cuts the vertical edges too. */
function rings(w: number, d: number, h: number, c: number, edges: ChamferEdges, corners: boolean): Ring[] {
	const full = (z: number): Ring => ({ z, x: w / 2, y: d / 2, cut: corners ? c : 0 });
	const narrow = (z: number): Ring => ({ z, x: w / 2 - c, y: d / 2 - c, cut: 0 });
	if (edges === 'top') return [{ ...full(0), cut: 0 }, { ...full(h - c), cut: 0 }, narrow(h)];
	if (edges === 'bottom') return [narrow(0), { ...full(c), cut: 0 }, { ...full(h), cut: 0 }];
	return [narrow(0), full(c), full(h - c), narrow(h)];
}

/** A box slice's outline: its rectangle with the four corners cut, counter-clockwise from above (8 points, some may coincide). */
function boxOutline(r: Ring): [number, number][] {
	const { x, y, cut } = r;
	return [
		[x, -(y - cut)],
		[x, y - cut],
		[x - cut, y],
		[-(x - cut), y],
		[-x, y - cut],
		[-x, -(y - cut)],
		[-(x - cut), -y],
		[x - cut, -y],
	];
}

function ellipseOutline(r: Ring, segments: number): [number, number][] {
	return Array.from({ length: segments }, (_, i) => {
		const a = (2 * Math.PI * i) / segments;
		return [r.x * Math.cos(a), r.y * Math.sin(a)] as [number, number];
	});
}

const same = (a: readonly number[], b: readonly number[]) => Math.abs(a[0]! - b[0]!) < 1e-9 && Math.abs(a[1]! - b[1]!) < 1e-9;

/** Builds the loft: points are shared where an outline's neighbours coincide, so degenerate faces are simply left out. */
function loft(outlines: [number, number][][], heights: number[]): MeshData {
	const positions: number[] = [];
	const indices: number[] = [];
	const ringIndices = outlines.map((outline, k) => {
		const ids: number[] = [];
		outline.forEach((p, i) => {
			if (i > 0 && same(p, outline[i - 1]!)) ids.push(ids[i - 1]!);
			else {
				ids.push(positions.length / 3);
				positions.push(p[0], p[1], heights[k]!);
			}
		});
		// the outline is closed: trailing points equal to the first one become the first one
		const last = ids[ids.length - 1]!;
		if (ids.length > 1 && last !== ids[0] && same(outline[outline.length - 1]!, outline[0]!)) {
			for (let i = ids.length - 1; i >= 0 && ids[i] === last; i--) ids[i] = ids[0]!;
		}
		return ids;
	});

	for (let k = 0; k + 1 < ringIndices.length; k++) {
		const [lo, hi] = [ringIndices[k]!, ringIndices[k + 1]!];
		for (let i = 0; i < lo.length; i++) {
			const j = (i + 1) % lo.length;
			if (lo[i] !== lo[j]) indices.push(lo[i]!, lo[j]!, hi[i]!);
			if (hi[i] !== hi[j]) indices.push(lo[j]!, hi[j]!, hi[i]!);
		}
	}
	const distinct = (ids: number[]) => ids.filter((id, i) => id !== ids[(i + ids.length - 1) % ids.length]);
	const bottom = distinct(ringIndices[0]!);
	for (let i = 1; i + 1 < bottom.length; i++) indices.push(bottom[0]!, bottom[i + 1]!, bottom[i]!);
	const top = distinct(ringIndices[ringIndices.length - 1]!);
	for (let i = 1; i + 1 < top.length; i++) indices.push(top[0]!, top[i]!, top[i + 1]!);

	return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** The mesh of a chamfered box or cylinder at its real size (mm), base centre at the origin, standing on z = 0. */
export function chamferedMesh(
	shapeType: 'box' | 'cylinder',
	width: number,
	depth: number,
	height: number,
	size: number,
	edges: ChamferEdges,
	segments = CHAMFER_CYLINDER_SEGMENTS,
): MeshData {
	const slices = rings(width, depth, height, size, edges, shapeType === 'box');
	const outlines = slices.map((r) => (shapeType === 'box' ? boxOutline(r) : ellipseOutline(r, segments)));
	return loft(
		outlines,
		slices.map((r) => r.z),
	);
}

/**
 * Sets a box's or cylinder's chamfer: `size` in mm (0 removes the chamfer and its edge choice) and/or which `edges`. The size is
 * stored as typed, and limited to what fits only when the shape is built, so a shape can be shrunk and grown back without losing it.
 */
export function setShapeChamfer(design: Design, id: NodeId, change: { size?: number; edges?: ChamferEdges }, now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'shape' || node.locked || !CHAMFERABLE.has(node.shapeType)) return design;
	const { size, edges } = change;
	if (size !== undefined && !(Number.isFinite(size) && size >= 0 && size <= MAX_SHAPE_SIZE)) return design;
	if (edges !== undefined && !CHAMFER_EDGES.includes(edges)) return design;

	const params = { ...node.params };
	if (size === 0) {
		delete params.chamfer;
		delete params.chamferEdges;
	} else {
		if (size !== undefined) params.chamfer = size;
		if (edges !== undefined) params.chamferEdges = edges;
	}
	const keys = new Set([...Object.keys(params), ...Object.keys(node.params)]);
	if ([...keys].every((k) => params[k] === node.params[k])) return design;
	return { ...design, nodes: { ...design.nodes, [id]: { ...node, params } }, updatedAt: (now ?? new Date()).toISOString() };
}
