import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';

/*
 * Text wrapped round a cylinder. The text is built flat as always (its Width is the length of the line along the surface, its Depth the height of
 * the letters, its Height how thick they are) and then bent about an axis along its own y (the letters' up), so a line of words follows a curve.
 * `params.wrap` is the cylinder's radius in mm: positive puts the letters on the outside of a cylinder (the middle of the line touches it and the
 * ends curl away below), negative on the inside (the ends curl up), and 0 or nothing is flat. It does not scale with the shape: it is a real cylinder.
 * The shape's origin stays where it was, on the line down the middle of the letters' base, so the point of the text that touches the cylinder
 * is the shape's base centre. All of this is plain maths on numbers, so it is the same on the page and in the geometry worker.
 */

/** How far round a cylinder the words may go (degrees): near a full turn the two ends of the line would meet. */
export const MAX_WRAP_SWEEP_DEG = 330;

type Vec3 = [number, number, number];

/**
 * The radius a text shape is actually wrapped at (signed, mm), 0 for flat. What was typed is kept, but the words never go further round than
 * `MAX_WRAP_SWEEP_DEG` (a smaller radius is raised to that, keeping its side), and on the inside the thickness cannot pass the axis.
 */
export function wrapOf(node: Pick<ShapeNode, 'params'>): number {
	const raw = Number(node.params.wrap);
	if (!Number.isFinite(raw) || raw === 0) return 0;
	const { width, height } = node.params as { width: number; height: number };
	let radius = Math.max(Math.abs(raw), width / ((MAX_WRAP_SWEEP_DEG * Math.PI) / 180));
	if (raw < 0) radius = Math.max(radius, height * 1.1);
	return Math.sign(raw) * radius;
}

/** Where a point of the flat text goes when bent (x along the line from its middle, y up the letters, z out of the page): see the notes above. */
export function wrapPoint(p: readonly number[], radius: number): Vec3 {
	const [x, y, z] = [p[0]!, p[1]!, p[2]!];
	if (!Number.isFinite(radius) || radius === 0) return [x, y, z];
	const rho = Math.abs(radius);
	const angle = x / rho;
	if (radius > 0) {
		const r = rho + z;
		return [r * Math.sin(angle), y, r * Math.cos(angle) - rho];
	}
	const r = rho - z;
	return [r * Math.sin(angle), y, rho - r * Math.cos(angle)];
}

/** The box round bent text in the shape's own frame: found from the corners and from where the line turns side-on (a quarter turn each way). */
export function wrappedBox(width: number, depth: number, height: number, radius: number): { min: Vec3; max: Vec3 } {
	if (!Number.isFinite(radius) || radius === 0) return { min: [-width / 2, -depth / 2, 0], max: [width / 2, depth / 2, height] };
	const rho = Math.abs(radius);
	const xs = [-width / 2, width / 2];
	for (const turn of [-(Math.PI * rho) / 2, (Math.PI * rho) / 2]) if (Math.abs(turn) < width / 2) xs.push(turn);
	const min: Vec3 = [Infinity, -depth / 2, Infinity];
	const max: Vec3 = [-Infinity, depth / 2, -Infinity];
	for (const x of [...xs, 0]) {
		for (const z of [0, height]) {
			const p = wrapPoint([x, 0, z], radius);
			for (const k of [0, 2] as const) {
				min[k] = Math.min(min[k], p[k]);
				max[k] = Math.max(max[k], p[k]);
			}
		}
	}
	return { min, max };
}

/** How high the lowest point of the text shape is in the world (z), from the corners of its box. */
function lowestZ(node: ShapeNode): number {
	const { width, depth, height } = node.params as { width: number; depth: number; height: number };
	const box = wrappedBox(width, depth, height, node.shapeType === 'text' ? wrapOf(node) : 0);
	const m = node.transform;
	let lowest = Number.POSITIVE_INFINITY;
	for (const x of [box.min[0], box.max[0]]) {
		for (const y of [box.min[1], box.max[1]]) {
			for (const z of [box.min[2], box.max[2]]) lowest = Math.min(lowest, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
		}
	}
	return lowest;
}

/**
 * Wraps a text shape round a cylinder of this radius (mm; negative for the inside; 0 takes the wrap off, and drops the setting). Text that was
 * resting on the workplane keeps resting on it (the ends of an outside curve would dip below it), and text in the air stays where it is.
 * Refused (the same design back) for a shape that is not text or is locked, a number that is not one, a radius past the size limit, or the same radius.
 */
export function setTextWrap(design: Design, id: NodeId, radius: number, now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'shape' || node.shapeType !== 'text' || node.locked) return design;
	if (!Number.isFinite(radius) || Math.abs(radius) > MAX_SHAPE_SIZE) return design;
	const { wrap: _old, ...rest } = node.params;
	if ((radius === 0 && !('wrap' in node.params)) || node.params.wrap === radius) return design;
	const wrapped: ShapeNode = { ...node, params: radius === 0 ? rest : { ...rest, wrap: radius } };
	if (Math.abs(lowestZ(node)) < 1e-6) {
		const transform = [...wrapped.transform];
		transform[14] = transform[14]! - lowestZ(wrapped);
		wrapped.transform = transform;
	}
	return { ...design, nodes: { ...design.nodes, [id]: wrapped }, updatedAt: (now ?? new Date()).toISOString() };
}
