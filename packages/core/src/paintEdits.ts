import type { Vec3 } from './camera.ts';
import type { Design, NodeId, PaintFill } from './design.ts';
import { MAX_FILL_ANGLE } from './paintRegions.ts';
import { isHexColor } from './palette.ts';

/** Editing the paint on a node (the Paint tool): see PaintFill. */

/** Most fills a node keeps, so a design file stays small. */
export const MAX_PAINT_FILLS = 1000;

const stamp = (now?: Date) => (now ?? new Date()).toISOString();
const finite = (v: Vec3) => v.every((n) => Number.isFinite(n));

/** Whether a node can take paint: a top-level solid shape or group that is shown and not locked. Paint is on the finished surface of what is printed as one body. */
export function canPaint(design: Design, id: NodeId): boolean {
	const node = design.nodes[id];
	if (!node || node.kind === 'mesh' || !design.roots.includes(id)) return false;
	return node.mode === 'solid' && !node.hidden && !node.locked;
}

function usable(fill: PaintFill): boolean {
	if (fill.id.length === 0) return false;
	if (fill.kind === 'body') return isHexColor(fill.color);
	if (fill.color !== null && !isHexColor(fill.color)) return false;
	if (fill.spread !== undefined && fill.spread !== 'smart' && fill.spread !== 'bucket') return false;
	if (fill.angle !== undefined && !(fill.angle >= 0 && fill.angle <= MAX_FILL_ANGLE)) return false;
	return finite(fill.point) && finite(fill.normal) && Math.abs(Math.hypot(...fill.normal) - 1) < 1e-3;
}

const sameFill = (a: PaintFill, b: PaintFill) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Puts a fill on a node, over what is there. A whole-body fill covers everything before it, so it replaces the list. The same design comes
 * back for a node that cannot be painted, a fill that is not usable (bad colour, a direction that is not length 1), one already on top,
 * or a node that already has the most fills.
 */
export function addPaint(design: Design, id: NodeId, fill: PaintFill, now?: Date): Design {
	const node = design.nodes[id];
	if (!node || !canPaint(design, id) || !usable(fill)) return design;
	const next = { ...fill, ...(fill.color !== null && { color: fill.color.toLowerCase() }) } as PaintFill;
	const before = node.paint ?? [];
	const last = before[before.length - 1];
	if (last && sameFill(last, next)) return design;
	const paint = next.kind === 'body' ? [next] : [...before, next];
	if (paint.length > MAX_PAINT_FILLS) return design;
	return { ...design, nodes: { ...design.nodes, [id]: { ...node, paint } }, updatedAt: stamp(now) };
}

/** Takes all the paint off a node (the field is left out). The same design back if it has none or cannot be edited. */
export function clearPaint(design: Design, id: NodeId, now?: Date): Design {
	const node = design.nodes[id];
	if (!node?.paint || node.locked) return design;
	const { paint: _gone, ...rest } = node;
	return { ...design, nodes: { ...design.nodes, [id]: rest as typeof node }, updatedAt: stamp(now) };
}

/** `fills` with every fill of colour `from` now `to` (the palette changed that slot). The same list when none is. */
export function recolourPaint(fills: readonly PaintFill[] | undefined, from: string, to: string): PaintFill[] | undefined {
	if (!fills?.some((f) => f.color === from)) return fills as PaintFill[] | undefined;
	return fills.map((f) => (f.color === from ? ({ ...f, color: to } as PaintFill) : f));
}

/**
 * The fills after the node they are on is stretched by `factors` along its axes (and moved by `shift`, if given): the points go where the
 * stretched surface is, and the directions turn as a stretched surface's do (by the inverse of the stretch, back to length 1), the same
 * rule as for edge treatments. The same list comes back when nothing changes.
 */
export function stretchPaint(fills: readonly PaintFill[] | undefined, factors: Vec3, shift: Vec3 | null): PaintFill[] | undefined {
	if (!fills) return undefined;
	const moves = shift?.some((v) => v !== 0) ?? false;
	if (!moves && factors.every((f) => f === 1)) return fills as PaintFill[];
	return fills.map((fill) => {
		if (fill.kind === 'body') return fill;
		const point = [0, 1, 2].map((k) => factors[k]! * fill.point[k]! + (shift ? shift[k]! : 0)) as Vec3;
		const raw = [0, 1, 2].map((k) => fill.normal[k]! / factors[k]!);
		const length = Math.hypot(...(raw as [number, number, number]));
		return { ...fill, point, normal: raw.map((v) => v / length) as Vec3 };
	});
}
