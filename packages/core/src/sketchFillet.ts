import { MAX_SKETCH_POINTS, type SketchOutline, type SketchPoint, type SketchSegment } from './sketch.ts';
import { segmentsOf } from './sketchCurves.ts';
import { withSides } from './sketchSides.ts';

/** Rounding the corners of an outline: a corner between two straight sides becomes a circular arc of a typed radius. */

/** A turn smaller than this (radians) is a straight run, not a corner. */
const MIN_TURN = 1e-3;
/** Two points closer than this (mm) are one. */
const SAME = 1e-9;

const length = (a: SketchPoint, b: SketchPoint) => Math.hypot(b[0] - a[0], b[1] - a[1]);

interface Round {
	/** Where the round leaves the side that comes in, and where it joins the side that goes out. */
	from: SketchPoint;
	to: SketchPoint;
	bulge: number;
}

/**
 * The round for corner `k`, or null if it has none: a side that is not a line, a straight run, or a radius that is no use. The round
 * never reaches past the middle of either side as the outline is now, so neighbouring rounds cannot overlap.
 */
function roundFor(outline: SketchOutline, sides: readonly SketchSegment[], k: number, radius: number): Round | null {
	const n = outline.points.length;
	const [a, p, b] = [outline.points[(k - 1 + n) % n], outline.points[k], outline.points[(k + 1) % n]];
	if (!a || !p || !b || sides[(k - 1 + n) % n] !== 'line' || sides[k] !== 'line') return null;
	const [lenIn, lenOut] = [length(a, p), length(p, b)];
	if (lenIn < SAME || lenOut < SAME) return null;
	const din: SketchPoint = [(p[0] - a[0]) / lenIn, (p[1] - a[1]) / lenIn];
	const dout: SketchPoint = [(b[0] - p[0]) / lenOut, (b[1] - p[1]) / lenOut];
	const turn = Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]); // signed: positive turns left
	if (Math.abs(turn) < MIN_TURN) return null;
	const half = Math.tan(Math.abs(turn) / 2);
	const reach = Math.min(radius * half, lenIn / 2, lenOut / 2);
	return {
		from: [p[0] - din[0] * reach, p[1] - din[1] * reach],
		to: [p[0] + dout[0] * reach, p[1] + dout[1] * reach],
		bulge: Math.sign(turn) * Math.tan(Math.abs(turn) / 4),
	};
}

/**
 * The outline with these corners rounded to `radius` mm (a corner is a point of the outline, counted from 0). A corner is left alone when
 * either side is curved, when it is not really a corner, or when it does not exist; where the radius would reach past the middle of a
 * side it is made smaller for that corner. Gives back the same object when nothing changed.
 */
export function filletCorners(outline: SketchOutline, radius: number, corners: readonly number[]): SketchOutline {
	if (!Number.isFinite(radius) || radius <= 0) return outline;
	const sides = segmentsOf(outline);
	const rounds = new Map<number, Round>();
	for (const k of corners) {
		const round = roundFor(outline, sides, k, radius);
		if (round) rounds.set(k, round);
	}
	if (rounds.size === 0 || outline.points.length + rounds.size > MAX_SKETCH_POINTS) return outline;

	// each rounded corner becomes two points joined by its arc; the side after the second keeps the corner's own outgoing side
	const points: SketchPoint[] = [];
	const kinds: SketchSegment[] = [];
	for (const [k, p] of outline.points.entries()) {
		const round = rounds.get(k);
		if (round) {
			points.push(round.from, round.to);
			kinds.push(round.bulge, sides[k]!);
		} else {
			points.push(p);
			kinds.push(sides[k]!);
		}
	}
	const tidy = dropRepeats(points, kinds);
	return withSides({ points: tidy.points }, tidy.kinds);
}

/** A straight side between two points that are the same point goes, with one of the points: rounds that meet in the middle of a side leave no flat piece. */
function dropRepeats(points: SketchPoint[], kinds: SketchSegment[]): { points: SketchPoint[]; kinds: SketchSegment[] } {
	const keep = points.map((p, i) => kinds[i] !== 'line' || length(p, points[(i + 1) % points.length]!) > SAME);
	return { points: points.filter((_, i) => keep[i]), kinds: kinds.filter((_, i) => keep[i]) };
}
