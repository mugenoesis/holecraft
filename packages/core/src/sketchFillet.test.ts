import { describe, expect, it } from 'vitest';
import { outlineArea, rectangleOutline, type SketchOutline } from './sketch.ts';
import { arcMidpoint, segmentsOf } from './sketchCurves.ts';
import { filletCorners } from './sketchFillet.ts';

const square = rectangleOutline([0, 0], [10, 10]);
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);
/** The area of the polygon is a little under the true area (the arcs are cut into short straight pieces), never over. */
const expectArea = (outline: SketchOutline, want: number) => {
	const got = Math.abs(outlineArea(outline));
	expect(got).toBeLessThanOrEqual(want + 1e-9);
	expect(got).toBeGreaterThan(want - 0.6);
};

describe('rounding one corner', () => {
	it('replaces the corner with two points r from it, joined by a quarter-circle that bulges outwards', () => {
		const out = filletCorners(square, 2, [0]);
		expect(out.points).toHaveLength(5);
		const sides = segmentsOf(out);
		const [t1, t2] = [out.points[0]!, out.points[1]!];
		// the corner (0, 0) is rounded off: both tangent points are 2 mm from it, one along each side
		expect(dist(t1, [0, 0])).toBeCloseTo(2, 9);
		expect(dist(t2, [0, 0])).toBeCloseTo(2, 9);
		const bulge = sides[0] as number;
		expect(Math.abs(bulge)).toBeCloseTo(Math.tan(Math.PI / 8), 9);
		// the arc's middle is where a circle of radius 2 centred at (2, 2) is closest to the corner
		const mid = arcMidpoint(t1, t2, bulge);
		expect(mid[0]).toBeCloseTo(2 - Math.SQRT2, 9);
		expect(mid[1]).toBeCloseTo(2 - Math.SQRT2, 9);
		expect(sides.filter((s) => s === 'line')).toHaveLength(4);
	});

	it('takes the right amount of area off (the corner minus a quarter circle)', () => {
		expectArea(filletCorners(square, 3, [2]), 100 - (1 - Math.PI / 4) * 9);
	});

	it('works the same for a corner that turns the other way round (a clockwise outline)', () => {
		const clockwise: SketchOutline = { points: [...square.points].reverse() };
		const out = filletCorners(clockwise, 2, [3]); // the corner at (0, 0) is the last point now
		const k = segmentsOf(out).findIndex((side) => side !== 'line');
		const mid = arcMidpoint(out.points[k]!, out.points[(k + 1) % out.points.length]!, segmentsOf(out)[k] as number);
		expect(mid[0]).toBeCloseTo(2 - Math.SQRT2, 9);
		expect(mid[1]).toBeCloseTo(2 - Math.SQRT2, 9);
	});

	it('works for any angle: tangent points sit r * tan(half the turn) from the corner', () => {
		// a 60 degree turn: the way in runs along x, the way out leaves at 60 degrees
		const wedge: SketchOutline = {
			points: [
				[0, 0],
				[10, 0],
				[15, 8.660254037844386],
			],
		};
		const out = filletCorners(wedge, 1, [1]);
		const t = Math.tan(Math.PI / 6);
		expect(dist(out.points[1]!, [10, 0])).toBeCloseTo(t, 9);
		expect(dist(out.points[2]!, [10, 0])).toBeCloseTo(t, 9);
	});

	it('is limited so the round never reaches past the middle of either side', () => {
		const out = filletCorners(square, 100, [0]);
		expect(dist(out.points[0]!, [0, 0])).toBeCloseTo(5, 9);
		expect(dist(out.points[1]!, [0, 0])).toBeCloseTo(5, 9);
	});

	it('does nothing, returning the same outline, when the radius is no use', () => {
		for (const r of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(filletCorners(square, r, [0])).toBe(square);
	});

	it('does nothing for a corner that is not a corner (straight on), a corner out of range, or a side that is curved', () => {
		const flat: SketchOutline = {
			points: [
				[0, 0],
				[5, 0],
				[10, 0],
				[10, 10],
			],
		};
		expect(filletCorners(flat, 1, [1])).toBe(flat);
		expect(filletCorners(square, 1, [7])).toBe(square);
		const curved: SketchOutline = { points: square.points, segments: [0.5, 'line', 'line', 'line'] };
		expect(filletCorners(curved, 1, [0])).toBe(curved);
		expect(filletCorners(curved, 1, [1])).toBe(curved);
		// a corner whose two sides are straight is still rounded in an outline that curves elsewhere
		expect(filletCorners(curved, 1, [3])).not.toBe(curved);
	});

	it('keeps the other sides as they were, arcs included', () => {
		const curved: SketchOutline = { points: square.points, segments: ['line', 'line', 'line', 0.5] };
		const out = filletCorners(curved, 1, [1]);
		expect(segmentsOf(out).filter((s) => s === 0.5)).toHaveLength(1);
	});
});

describe('rounding several corners', () => {
	it('rounds all four corners of a rectangle at once: eight points, a rounded-rectangle area', () => {
		const out = filletCorners(rectangleOutline([0, 0], [30, 20]), 4, [0, 1, 2, 3]);
		expect(out.points).toHaveLength(8);
		expectArea(out, 600 - (4 - Math.PI) * 16);
	});

	it('limits each corner by half of its sides as they were, so neighbours never overlap', () => {
		const out = filletCorners(square, 100, [0, 1, 2, 3]);
		// 5 mm each: the rounds meet in the middle of every side, which leaves a circle of four arcs and no flat piece
		expect(out.points).toHaveLength(4);
		expect(segmentsOf(out).every((s) => typeof s === 'number')).toBe(true);
		expectArea(out, Math.PI * 25);
	});

	it('skips corners it cannot round and rounds the rest', () => {
		const mixed: SketchOutline = { points: square.points, segments: [0.5, 'line', 'line', 'line'] };
		const out = filletCorners(mixed, 1, [0, 1, 2, 3]);
		// corners 0 and 1 touch the curved side 0; corners 2 and 3 are rounded
		expect(out.points).toHaveLength(6);
	});
});
