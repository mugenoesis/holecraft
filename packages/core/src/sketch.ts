import { MAX_SHAPE_SIZE } from './limits.ts';
import { flattenOutline, MAX_BULGE } from './sketchCurves.ts';

/**
 * A sketch: flat outlines drawn on a plane (the Sketch tool), which a Sketch shape extrudes. Coordinates are millimetres on the plane, x
 * to the right and y up, the same as the shape's own x and y. Where outlines lie inside others they are holes: the whole is filled by
 * the even-odd rule, so nothing needs to say which outline is a hole.
 */

export type SketchPoint = [number, number];

/**
 * What one side of an outline is (see sketchCurves.ts): `'line'`, an arc given by its bulge (a number), or a smooth `'curve'` through the points.
 */
export type SketchSegment = 'line' | 'curve' | number;

/**
 * A closed outline: the last point joins back to the first (it is not repeated). `segments[i]` is the side from `points[i]` to the next
 * point; with none given (or fewer than the points) the sides are straight lines.
 */
export interface SketchOutline {
	points: SketchPoint[];
	segments?: SketchSegment[];
}

export interface Sketch {
	outlines: SketchOutline[];
}

export const MAX_SKETCH_OUTLINES = 64;
export const MAX_SKETCH_POINTS = 512;
/** A coordinate beyond this (mm) is refused as not a drawing. */
export const MAX_SKETCH_COORDINATE = 1e5;
/** Smallest a sketch may be across (mm): a Shape cannot be thinner than this. */
const MIN_SKETCH_SIZE = 0.1;
/** Points this close (mm) are the same point. */
const SAME = 1e-9;
/** How far (mm) a straight piece of a curve may stray from it where the drawing is measured, filled and cut. */
export const SKETCH_TOLERANCE = 0.02;
/** A bulge smaller than this is a line. */
const MIN_BULGE = 1e-4;

/** The corners of an outline as a polygon: its own points, with the curves between them cut into short straight pieces. */
export function outlinePolygon(outline: SketchOutline): SketchPoint[] {
	return outline.segments?.some((kind) => kind !== 'line') ? flattenOutline(outline, SKETCH_TOLERANCE) : outline.points;
}

/** An outline's area (mm2): positive counter-clockwise, negative clockwise. */
export function outlineArea(outline: SketchOutline): number {
	const p = outlinePolygon(outline);
	let sum = 0;
	for (let i = 0; i < p.length; i++) {
		const [x0, y0] = p[i]!;
		const [x1, y1] = p[(i + 1) % p.length]!;
		sum += x0 * y1 - x1 * y0;
	}
	return sum / 2;
}

/** Whether a point is inside an outline (even-odd ray casting). */
export function pointInOutline(outline: SketchOutline, [x, y]: SketchPoint): boolean {
	const p = outlinePolygon(outline);
	let inside = false;
	for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
		const [xi, yi] = p[i]!;
		const [xj, yj] = p[j]!;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

/** The outlines a point is inside, the smallest first (so a hole inside a plate is found before the plate). */
export function sketchHits(sketch: Sketch, at: SketchPoint): number[] {
	return sketch.outlines
		.flatMap((outline, index) => (pointInOutline(outline, at) ? [{ index, area: Math.abs(outlineArea(outline)) }] : []))
		.sort((a, b) => a.area - b.area || a.index - b.index)
		.map((hit) => hit.index);
}

/** The rectangle with these two opposite corners, counter-clockwise from its lower left. */
export function rectangleOutline(a: SketchPoint, b: SketchPoint): SketchOutline {
	const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
	const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
	return {
		points: [
			[x0, y0],
			[x1, y0],
			[x1, y1],
			[x0, y1],
		],
	};
}

/** A regular polygon: `sides` corners on a circle of `radius`, the first at `angle` (radians, from +x), going counter-clockwise. */
export function regularPolygon(centre: SketchPoint, radius: number, sides: number, angle = 0): SketchOutline {
	return {
		points: Array.from({ length: sides }, (_, i) => {
			const a = angle + (2 * Math.PI * i) / sides;
			return [centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a)] as SketchPoint;
		}),
	};
}

/** A circle: two points on opposite sides, joined by two half circles (a true curve, cut into pieces only to be built). */
export function circleOutline(centre: SketchPoint, radius: number): SketchOutline {
	return {
		points: [
			[centre[0] - radius, centre[1]],
			[centre[0] + radius, centre[1]],
		],
		segments: [1, 1],
	};
}

/** One kind of side as it may be saved: a line, a smooth curve, or an arc with a bulge no bigger than MAX_BULGE. */
export function isSketchSegment(kind: unknown): kind is SketchSegment {
	return kind === 'line' || kind === 'curve' || (typeof kind === 'number' && Number.isFinite(kind) && Math.abs(kind) <= MAX_BULGE);
}

const samePoint = (a: SketchPoint, b: SketchPoint) => Math.abs(a[0] - b[0]) <= SAME && Math.abs(a[1] - b[1]) <= SAME;

/**
 * An outline's corners with repeats (and a closing repeat of the first point) taken out, and each corner's side kept with it: a corner
 * that was repeated hands on the side that leaves it. Null if a side is not a kind there is.
 */
function tidyOutline(outline: SketchOutline): SketchOutline | null {
	const sides = outline.points.map((_, i) => outline.segments?.[i] ?? 'line');
	if (!sides.every(isSketchSegment)) return null;
	const points: SketchPoint[] = [];
	const kept: SketchSegment[] = [];
	outline.points.forEach((p, i) => {
		const last = points[points.length - 1];
		if (last && samePoint(last, p)) kept[kept.length - 1] = sides[i]!;
		else {
			points.push([p[0], p[1]]);
			kept.push(sides[i]!);
		}
	});
	if (points.length > 1 && samePoint(points[0]!, points[points.length - 1]!)) {
		points.pop();
		kept.pop();
	}
	const segments = kept.map((k) => (typeof k === 'number' && Math.abs(k) < MIN_BULGE ? 'line' : k));
	return segments.every((k) => k === 'line') ? { points } : { points, segments };
}

export interface NormalizedSketch {
	/** The outlines moved so the middle of their bounding box is the origin. */
	sketch: Sketch;
	/** Where that middle was, on the plane. */
	centre: SketchPoint;
	width: number;
	depth: number;
}

/** The corners of the box round a sketch's outlines (their curves, not only their points), and its size. */
export function sketchBox(sketch: Sketch): { min: SketchPoint; max: SketchPoint; width: number; depth: number } {
	const min: SketchPoint = [Infinity, Infinity];
	const max: SketchPoint = [-Infinity, -Infinity];
	for (const outline of sketch.outlines) {
		for (const [x, y] of outlinePolygon(outline)) {
			min[0] = Math.min(min[0], x);
			min[1] = Math.min(min[1], y);
			max[0] = Math.max(max[0], x);
			max[1] = Math.max(max[1], y);
		}
	}
	return { min, max, width: max[0] - min[0], depth: max[1] - min[1] };
}

const usableCoordinate = (v: number) => Number.isFinite(v) && Math.abs(v) <= MAX_SKETCH_COORDINATE;

/** The outlines that make a shape (cleaned), or null if one has too many points, a coordinate that is not usable, or a side that is not a kind there is. */
function keptOutlines(outlines: readonly SketchOutline[]): SketchOutline[] | null {
	const kept: SketchOutline[] = [];
	for (const outline of outlines) {
		if (outline.points.length > MAX_SKETCH_POINTS) return null;
		if (!outline.points.every((p) => usableCoordinate(p[0]) && usableCoordinate(p[1]))) return null;
		const tidy = tidyOutline(outline);
		if (!tidy) return null;
		const enough = tidy.points.length >= 3 || (tidy.points.length === 2 && tidy.segments !== undefined);
		if (enough && Math.abs(outlineArea(tidy)) > 1e-9) kept.push(tidy);
	}
	return kept;
}

/**
 * A drawing made fit to be a shape: outlines with no area (under three corners, or two with no curve, or flat) are dropped, repeated points are taken out, and the
 * drawing is moved to the origin. Null if nothing is left, a coordinate is not a usable number, there are too many outlines or points, or the
 * drawing is smaller than 0.1 mm or bigger than a shape may be across.
 */
export function normalizeSketch(outlines: readonly SketchOutline[]): NormalizedSketch | null {
	if (outlines.length > MAX_SKETCH_OUTLINES) return null;
	const kept = keptOutlines(outlines);
	if (!kept || kept.length === 0) return null;
	const box = sketchBox({ outlines: kept });
	if (box.width < MIN_SKETCH_SIZE || box.depth < MIN_SKETCH_SIZE || box.width > MAX_SHAPE_SIZE || box.depth > MAX_SHAPE_SIZE) return null;
	const centre: SketchPoint = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
	const moved = kept.map((o) => ({
		points: o.points.map(([x, y]) => [x - centre[0], y - centre[1]] as SketchPoint),
		...(o.segments && { segments: o.segments }),
	}));
	return { sketch: { outlines: moved }, centre, width: box.width, depth: box.depth };
}
