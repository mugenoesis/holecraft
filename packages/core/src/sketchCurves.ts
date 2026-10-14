import type { SketchOutline, SketchPoint, SketchSegment } from './sketch.ts';

/**
 * The curves of a sketch outline. Each side of an outline (from `points[i]` to the next point, the last back to the first) is one of:
 * - `'line'`: straight;
 * - a number, the **bulge** of a circular arc over the side: tan(a quarter of the angle the arc sweeps), positive for an arc that goes
 *   counter-clockwise from the side's start to its end (bulging to the right of the direction of travel), negative for clockwise, so 1
 *   is a half circle on the side;
 * - `'curve'`: a smooth curve through the points (a Catmull-Rom spline as a cubic Bezier): where two curves meet the curve runs on
 *   through the point without a corner, and where a curve meets any other kind of side there is a corner.
 * Curves are turned into short straight pieces (`flattenOutline`) to be filled, extruded and exported.
 */

/** The biggest bulge an arc may have: about 307 degrees of arc. */
export const MAX_BULGE = 4;
/** An arc flatter than this is a line. */
const MIN_BULGE = 1e-4;
/** Most points one side may be cut into, whatever the tolerance asks. */
const MAX_PIECES = 256;
const DEFAULT_TOLERANCE = 0.02;

const sub = (a: SketchPoint, b: SketchPoint): SketchPoint => [a[0] - b[0], a[1] - b[1]];
const add = (a: SketchPoint, b: SketchPoint): SketchPoint => [a[0] + b[0], a[1] + b[1]];
const scale = (a: SketchPoint, k: number): SketchPoint => [a[0] * k, a[1] * k];
const cross = (a: SketchPoint, b: SketchPoint) => a[0] * b[1] - a[1] * b[0];
const dot = (a: SketchPoint, b: SketchPoint) => a[0] * b[0] + a[1] * b[1];
const length = (a: SketchPoint) => Math.hypot(a[0], a[1]);

const usable = (tolerance: number) => (Number.isFinite(tolerance) && tolerance > 0 ? Math.max(tolerance, 1e-6) : DEFAULT_TOLERANCE);

/** The kind of each side of an outline: lines unless it says otherwise. */
export function segmentsOf(outline: SketchOutline): SketchSegment[] {
	return outline.points.map((_, i) => outline.segments?.[i] ?? 'line');
}

/**
 * The bulge of the arc that goes from `a` through `m` to `b`: 0 when `m` is between them on a straight line, null when there is no such
 * arc (the points coincide, or `m` is out past an end so the arc would be a whole circle or more), and never beyond MAX_BULGE.
 */
export function bulgeThrough(a: SketchPoint, m: SketchPoint, b: SketchPoint): number | null {
	const [ma, mb] = [sub(a, m), sub(b, m)];
	if (length(ma) < 1e-9 || length(mb) < 1e-9 || length(sub(b, a)) < 1e-9) return null;
	const angle = Math.atan2(Math.abs(cross(ma, mb)), dot(ma, mb)); // the angle at m, between 0 and pi
	if (angle > Math.PI - 1e-9) return 0;
	const bulge = 1 / Math.tan(angle / 2);
	if (bulge > MAX_BULGE) return null;
	return cross(sub(m, a), sub(b, m)) > 0 ? bulge : -bulge;
}

/** The middle of the arc over the side from `a` to `b` with this bulge (the chord's middle for 0). */
export function arcMidpoint(a: SketchPoint, b: SketchPoint, bulge: number): SketchPoint {
	const chord = sub(b, a);
	const left: SketchPoint = [-chord[1], chord[0]];
	const mid = scale(add(a, b), 0.5);
	return sub(mid, scale(left, bulge / 2));
}

/** The centre of the circle an arc is part of (for a bulge of 0 there is none: a point far away on the chord's perpendicular). */
export function arcCentre(a: SketchPoint, b: SketchPoint, bulge: number): SketchPoint {
	const chord = sub(b, a);
	const left: SketchPoint = [-chord[1], chord[0]];
	const mid = scale(add(a, b), 0.5);
	return add(mid, scale(left, (1 - bulge * bulge) / (4 * bulge || 1e-9)));
}

/** The points of an arc strictly between its ends, spaced so no straight piece strays more than `tol` from the circle. */
function arcPoints(a: SketchPoint, b: SketchPoint, bulge: number, tol: number): SketchPoint[] {
	const centre = arcCentre(a, b, bulge);
	const radius = length(sub(a, centre));
	const sweep = 4 * Math.atan(bulge);
	const step = radius <= tol ? Math.PI : 2 * Math.acos(Math.max(-1, 1 - tol / radius));
	const pieces = Math.min(MAX_PIECES, Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3))));
	const start = Math.atan2(a[1] - centre[1], a[0] - centre[0]);
	return Array.from({ length: pieces - 1 }, (_, k) => {
		const t = start + (sweep * (k + 1)) / pieces;
		return [centre[0] + radius * Math.cos(t), centre[1] + radius * Math.sin(t)] as SketchPoint;
	});
}

type Bezier = [SketchPoint, SketchPoint, SketchPoint, SketchPoint];

/** The cubic Bezier of the smooth side from point `i` to the next: tangents through the neighbours where the curve carries on, along the side at a corner. */
function curveBezier(points: SketchPoint[], kinds: SketchSegment[], i: number, closed = true): Bezier {
	const n = points.length;
	const [p1, p2] = [points[i]!, points[(i + 1) % n]!];
	// the ends of an open path are corners; in a closed outline every point has a side either side
	const smooth = (k: number) => (closed || (k > 0 && k < n - 1)) && kinds[(k + n) % n] === 'curve' && kinds[(k - 1 + n) % n] === 'curve';
	const tangent = (k: number, along: SketchPoint): SketchPoint =>
		smooth(k) ? scale(sub(points[(k + 1) % n]!, points[(k - 1 + n) % n]!), 0.5) : along;
	const chord = sub(p2, p1);
	const [m1, m2] = [tangent(i, chord), tangent(i + 1, chord)];
	return [p1, add(p1, scale(m1, 1 / 3)), sub(p2, scale(m2, 1 / 3)), p2];
}

const bezierAt = ([p0, p1, p2, p3]: Bezier, t: number): SketchPoint => {
	const u = 1 - t;
	return [0, 1].map((k) => u * u * u * p0[k]! + 3 * u * u * t * p1[k]! + 3 * u * t * t * p2[k]! + t * t * t * p3[k]!) as SketchPoint;
};

/** How far point `p` is from the line through `a` and `b`. */
function lineDistance(p: SketchPoint, a: SketchPoint, b: SketchPoint): number {
	const chord = sub(b, a);
	const len = length(chord);
	return len < 1e-12 ? length(sub(p, a)) : Math.abs(cross(sub(p, a), chord)) / len;
}

/** The points of a Bezier strictly between its ends, subdivided until each piece is flat to within `tol`. */
function bezierPoints(bezier: Bezier, tol: number, budget = { left: MAX_PIECES }): SketchPoint[] {
	const [p0, p1, p2, p3] = bezier;
	const flat = Math.max(lineDistance(p1, p0, p3), lineDistance(p2, p0, p3)) <= tol;
	if (flat || budget.left <= 0) return [];
	budget.left--;
	const mid = bezierAt(bezier, 0.5);
	const half = (t0: number, t1: number): Bezier => {
		const [a, b] = [bezierAt(bezier, t0), bezierAt(bezier, t1)];
		const span = t1 - t0;
		const derivative = (t: number): SketchPoint => {
			const u = 1 - t;
			return [0, 1].map((k) => 3 * (u * u * (p1[k]! - p0[k]!) + 2 * u * t * (p2[k]! - p1[k]!) + t * t * (p3[k]! - p2[k]!))) as SketchPoint;
		};
		return [a, add(a, scale(derivative(t0), span / 3)), sub(b, scale(derivative(t1), span / 3)), b];
	};
	return [...bezierPoints(half(0, 0.5), tol, budget), mid, ...bezierPoints(half(0.5, 1), tol, budget)];
}

/**
 * The corners of an outline with its curves cut into straight pieces: each arc and smooth curve gets points so no piece strays more than
 * `tolerance` mm from the true curve. The points of the outline itself are all kept, in order, and the result is the same outline when it
 * has no curves. The last point joins back to the first.
 */
export function flattenOutline(outline: SketchOutline, tolerance = DEFAULT_TOLERANCE): SketchPoint[] {
	return flattenSides(outline.points, segmentsOf(outline), true, tolerance);
}

/**
 * The same for a path that is not closed (a line being drawn): the sides are `kinds[i]` from point i to the next, the last point has none,
 * and the result ends at the last point. Both ends of a curve are corners.
 */
export function flattenPath(points: SketchPoint[], kinds: SketchSegment[], tolerance = DEFAULT_TOLERANCE): SketchPoint[] {
	return flattenSides(points, kinds, false, tolerance);
}

function flattenSides(points: SketchPoint[], kinds: SketchSegment[], closed: boolean, tolerance: number): SketchPoint[] {
	const tol = usable(tolerance);
	const sides = closed ? points.length : points.length - 1;
	const out = points.flatMap((p, i) => {
		const kind = kinds[i] ?? 'line';
		const next = points[(i + 1) % points.length]!;
		if (i >= sides) return [p];
		if (typeof kind === 'number' && Math.abs(kind) >= MIN_BULGE) return [p, ...arcPoints(p, next, kind, tol)];
		if (kind === 'curve') return [p, ...bezierPoints(curveBezier(points, kinds, i, closed), tol)];
		return [p];
	});
	return out;
}

/** The middle of side `i` of an outline: where its handle goes (the chord's middle for a line, the arc's or the curve's own middle otherwise). */
export function segmentMidpoint(outline: SketchOutline, i: number): SketchPoint {
	const { points } = outline;
	const kind = segmentsOf(outline)[i] ?? 'line';
	const [a, b] = [points[i]!, points[(i + 1) % points.length]!];
	if (typeof kind === 'number') return arcMidpoint(a, b, kind);
	if (kind === 'curve') return bezierAt(curveBezier(points, segmentsOf(outline), i), 0.5);
	return scale(add(a, b), 0.5);
}
