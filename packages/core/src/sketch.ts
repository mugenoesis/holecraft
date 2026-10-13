import { MAX_SHAPE_SIZE } from './limits.ts';

/**
 * A sketch: flat outlines drawn on a plane (the Sketch tool), which a Sketch shape extrudes. Coordinates are millimetres on the plane, x
 * to the right and y up, the same as the shape's own x and y. Where outlines lie inside others they are holes: the whole is filled by
 * the even-odd rule, so nothing needs to say which outline is a hole.
 */

export type SketchPoint = [number, number];

/** A closed polygon: the last point joins back to the first (it is not repeated). */
export interface SketchOutline {
	points: SketchPoint[];
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

/** An outline's area (mm2): positive counter-clockwise, negative clockwise. */
export function outlineArea(outline: SketchOutline): number {
	const p = outline.points;
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
	const p = outline.points;
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

/** A circle as a polygon with enough sides to look round at its size (16 for a tiny one, up to 128 for a huge one). */
export function circleOutline(centre: SketchPoint, radius: number): SketchOutline {
	const sides = Math.max(16, Math.min(128, Math.round(16 + 8 * Math.log2(Math.max(radius, 1)))));
	return regularPolygon(centre, radius, sides);
}

/** The corners of an outline with repeats (and a closing repeat of the first point) taken out. */
function tidyPoints(points: readonly SketchPoint[]): SketchPoint[] {
	const out: SketchPoint[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (!last || Math.abs(p[0] - last[0]) > SAME || Math.abs(p[1] - last[1]) > SAME) out.push([p[0], p[1]]);
	}
	const [first, last] = [out[0], out[out.length - 1]];
	if (out.length > 1 && first && last && Math.abs(first[0] - last[0]) <= SAME && Math.abs(first[1] - last[1]) <= SAME) out.pop();
	return out;
}

export interface NormalizedSketch {
	/** The outlines moved so the middle of their bounding box is the origin. */
	sketch: Sketch;
	/** Where that middle was, on the plane. */
	centre: SketchPoint;
	width: number;
	depth: number;
}

/** The corners of the box round a sketch's outlines, and its size. */
export function sketchBox(sketch: Sketch): { min: SketchPoint; max: SketchPoint; width: number; depth: number } {
	const min: SketchPoint = [Infinity, Infinity];
	const max: SketchPoint = [-Infinity, -Infinity];
	for (const outline of sketch.outlines) {
		for (const [x, y] of outline.points) {
			min[0] = Math.min(min[0], x);
			min[1] = Math.min(min[1], y);
			max[0] = Math.max(max[0], x);
			max[1] = Math.max(max[1], y);
		}
	}
	return { min, max, width: max[0] - min[0], depth: max[1] - min[1] };
}

const usableCoordinate = (v: number) => Number.isFinite(v) && Math.abs(v) <= MAX_SKETCH_COORDINATE;

/**
 * A drawing made fit to be a shape: outlines with no area (under three corners, or flat) are dropped, repeated points are taken out, and the
 * drawing is moved to the origin. Null if nothing is left, a coordinate is not a usable number, there are too many outlines or points, or the
 * drawing is smaller than 0.1 mm or bigger than a shape may be across.
 */
export function normalizeSketch(outlines: readonly SketchOutline[]): NormalizedSketch | null {
	if (outlines.length > MAX_SKETCH_OUTLINES) return null;
	const kept: SketchOutline[] = [];
	for (const outline of outlines) {
		if (outline.points.length > MAX_SKETCH_POINTS) return null;
		if (!outline.points.every((p) => usableCoordinate(p[0]) && usableCoordinate(p[1]))) return null;
		const points = tidyPoints(outline.points);
		if (points.length >= 3 && Math.abs(outlineArea({ points })) > 1e-9) kept.push({ points });
	}
	if (kept.length === 0) return null;
	const box = sketchBox({ outlines: kept });
	if (box.width < MIN_SKETCH_SIZE || box.depth < MIN_SKETCH_SIZE || box.width > MAX_SHAPE_SIZE || box.depth > MAX_SHAPE_SIZE) return null;
	const centre: SketchPoint = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
	const moved = kept.map((o) => ({ points: o.points.map(([x, y]) => [x - centre[0], y - centre[1]] as SketchPoint) }));
	return { sketch: { outlines: moved }, centre, width: box.width, depth: box.depth };
}
