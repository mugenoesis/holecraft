import type { Vec3 } from './camera.ts';
import type { Mat4 } from './design.ts';
import type { MeshEdge } from './edges.ts';
import { transformPoint } from './mat4.ts';

/**
 * Snapping the ruler to the corners and edges of the solids: within a few pixels of one, the measured point jumps onto it, exactly.
 * It works on edges already in the world (see `worldEdges`) and on where the viewport puts a point on the screen, so it is plain maths
 * that can be tested without a browser.
 */

export type SnapKind = 'corner' | 'middle' | 'edge';

export interface Snap {
	point: Vec3;
	kind: SnapKind;
}

/** An edge of a solid in the world: a polyline, closed (a rim: no corners) or open (its ends are corners). */
export interface SnapEdge {
	points: Vec3[];
	closed: boolean;
}

/** Pixels from the pointer within which a corner, a middle or an edge catches the ruler. */
export const SNAP_REACH = 12;

/** The edges of a shape or group (in its own frame, as the Edge tool finds them) placed where it is in the world. */
export function worldEdges(edges: readonly MeshEdge[], transform: Readonly<Mat4>): SnapEdge[] {
	return edges.map((e) => ({ points: e.points.map((p) => transformPoint(transform, p)), closed: e.closed }));
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const distance = (a: Vec3, b: Vec3) => Math.hypot(...sub(a, b));

/** Where a piece of an edge is closest to a point: the point on segment a-b nearest to p. */
function nearestOnSegment(a: Vec3, b: Vec3, p: Vec3): Vec3 {
	const ab = sub(b, a);
	const len2 = dot(ab, ab);
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
	return [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
}

/** The middle of an edge that is one straight line (a curve has none), or null. */
function middleOf(edge: SnapEdge): Vec3 | null {
	if (edge.closed || edge.points.length < 2) return null;
	const [first, last] = [edge.points[0]!, edge.points[edge.points.length - 1]!];
	const along = sub(last, first);
	const length = Math.hypot(...along);
	if (length === 0) return null;
	const straight = edge.points.every((p) => {
		const d = sub(p, first);
		const t = dot(d, along) / (length * length);
		return distance(d, [along[0] * t, along[1] * t, along[2] * t]) < 1e-6 * Math.max(1, length);
	});
	return straight ? [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2, (first[2] + last[2]) / 2] : null;
}

/** How many pixels a millimetre is on the screen at `hit` (the most along any axis), or 0 if the point can't be placed there. */
function pixelsPerMmAt(project: (p: Vec3) => { x: number; y: number } | null, hit: Vec3): number {
	const here = project(hit);
	if (!here) return 0;
	let most = 0;
	for (const axis of [0, 1, 2]) {
		const nudged = [...hit] as Vec3;
		nudged[axis] = nudged[axis]! + 1;
		const there = project(nudged);
		if (there) most = Math.max(most, Math.hypot(there.x - here.x, there.y - here.y));
	}
	return most;
}

/**
 * The corner, edge middle or edge to snap to for a pointer at `pointer` (pixels) that is over the surface at `hit` (a point in the world), or
 * null. A corner beats a middle, which beats the edge itself; among the same kind the one nearest the pointer on screen wins. An edge counts
 * only if it is close to `hit` in the world as well as on the screen, so an edge behind the face being pointed at (it lines up on screen but
 * is deeper) is never caught. `project` puts a world point on the screen, or null if it can't.
 */
export function snapToEdges(
	edges: readonly SnapEdge[],
	project: (p: Vec3) => { x: number; y: number } | null,
	hit: Vec3,
	pointer: { x: number; y: number },
	reach = SNAP_REACH,
): Snap | null {
	const pixelsPerMm = pixelsPerMmAt(project, hit);
	if (!(pixelsPerMm > 0)) return null;
	const nearBy = (reach / pixelsPerMm) * 1.5;

	const best: Partial<Record<SnapKind, { point: Vec3; pixels: number }>> = {};
	const consider = (kind: SnapKind, point: Vec3) => {
		if (distance(point, hit) > nearBy) return;
		const at = project(point);
		if (!at) return;
		const pixels = Math.hypot(at.x - pointer.x, at.y - pointer.y);
		if (pixels <= reach && pixels < (best[kind]?.pixels ?? Number.POSITIVE_INFINITY)) best[kind] = { point, pixels };
	};
	for (const edge of edges) {
		if (!edge.closed) {
			consider('corner', edge.points[0]!);
			consider('corner', edge.points[edge.points.length - 1]!);
		}
		const middle = middleOf(edge);
		if (middle) consider('middle', middle);
		const count = edge.points.length + (edge.closed ? 0 : -1);
		for (let i = 0; i < count; i++) consider('edge', nearestOnSegment(edge.points[i]!, edge.points[(i + 1) % edge.points.length]!, hit));
	}
	for (const kind of ['corner', 'middle', 'edge'] as const) {
		const found = best[kind];
		if (found) return { point: found.point, kind };
	}
	return null;
}
