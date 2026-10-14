import type { SketchOutline, SketchSegment } from './sketch.ts';
import { segmentsOf } from './sketchCurves.ts';

/** Editing the sides of an outline: which are lines, arcs or smooth curves. All return a new outline and never change the one given. */

/** An arc with a bulge under this is drawn as a line, so a side dragged back onto its chord goes straight again. */
const STRAIGHT_BULGE = 0.01;

/** The outline with these sides; the field is left out when they are all lines, so a plain polygon is just its points. */
export function withSides(outline: SketchOutline, sides: readonly SketchSegment[]): SketchOutline {
	return sides.every((kind) => kind === 'line') ? { points: outline.points } : { points: outline.points, segments: [...sides] };
}

/** A bulge as the kind of side it is: a line when it is nearly flat. */
export const sideOf = (bulge: number): SketchSegment => (Math.abs(bulge) < STRAIGHT_BULGE ? 'line' : bulge);

/** The outline with side `i` set to `kind`. */
export function withSide(outline: SketchOutline, i: number, kind: SketchSegment): SketchOutline {
	return withSides(
		outline,
		segmentsOf(outline).map((side, k) => (k === i ? kind : side)),
	);
}

/** Every side a line. */
export const straightened = (outline: SketchOutline): SketchOutline => ({ points: outline.points });

/** Every side a smooth curve through the points (it takes three points: two have nothing to curve between). */
export function smoothed(outline: SketchOutline): SketchOutline {
	return outline.points.length < 3
		? outline
		: withSides(
				outline,
				outline.points.map(() => 'curve'),
			);
}

/**
 * The outline without corner `k`. The side that came in and the side that went out become one: a smooth curve if both were, a line
 * otherwise (an arc over a longer chord would be a different arc).
 */
export function withoutPoint(outline: SketchOutline, k: number): SketchOutline {
	const sides = segmentsOf(outline);
	const n = sides.length;
	const before = (k - 1 + n) % n;
	const joined: SketchSegment = sides[before] === 'curve' && sides[k] === 'curve' ? 'curve' : 'line';
	const points = outline.points.filter((_, i) => i !== k);
	const kept = sides.flatMap((side, i) => (i === k ? [] : [i === before ? joined : side]));
	return withSides({ points }, kept);
}

/** Whether any side is not a line. */
export const hasCurves = (outline: SketchOutline) => segmentsOf(outline).some((kind) => kind !== 'line');
