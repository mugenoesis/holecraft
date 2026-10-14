import { describe, expect, it } from 'vitest';
import {
	circleOutline,
	MAX_SKETCH_OUTLINES,
	MAX_SKETCH_POINTS,
	normalizeSketch,
	outlineArea,
	pointInOutline,
	rectangleOutline,
	regularPolygon,
	type SketchOutline,
	type SketchPoint,
	sketchBox,
	sketchHits,
} from './sketch.ts';
import { flattenOutline } from './sketchCurves.ts';

const square = (x: number, y: number, size: number): SketchOutline => ({
	points: [
		[x, y],
		[x + size, y],
		[x + size, y + size],
		[x, y + size],
	],
});

describe('outline shapes', () => {
	it('a rectangle from two opposite corners is counter-clockwise with the area of the box, whichever corners are given', () => {
		for (const [a, b] of [
			[
				[0, 0],
				[30, 20],
			],
			[
				[30, 20],
				[0, 0],
			],
			[
				[30, 0],
				[0, 20],
			],
		] as [SketchPoint, SketchPoint][]) {
			const r = rectangleOutline(a, b);
			expect(r.points).toHaveLength(4);
			expect(outlineArea(r)).toBeCloseTo(600, 9);
		}
	});

	it('a circle is two half circles (two points and two arcs), as true as the tolerance: every flattened point is the radius from the centre, and its area is just under pi r squared', () => {
		const c = circleOutline([5, -3], 10);
		expect(c.points).toEqual([
			[-5, -3],
			[15, -3],
		]);
		expect(c.segments).toEqual([1, 1]);
		const flat = flattenOutline(c, 0.01);
		for (const [x, y] of flat) expect(Math.hypot(x - 5, y + 3)).toBeCloseTo(10, 9);
		expect(outlineArea(c)).toBeGreaterThan(Math.PI * 100 * 0.99);
		expect(outlineArea(c)).toBeLessThan(Math.PI * 100);
	});

	it('a regular polygon has its first corner at the given angle and the area (n/2) r2 sin(2 pi / n)', () => {
		const p = regularPolygon([0, 0], 10, 6, Math.PI / 2);
		expect(p.points).toHaveLength(6);
		expect(p.points[0]![0]).toBeCloseTo(0, 9);
		expect(p.points[0]![1]).toBeCloseTo(10, 9);
		expect(outlineArea(p)).toBeCloseTo(3 * 100 * Math.sin(Math.PI / 3), 9);
	});
});

describe('outlineArea and pointInOutline', () => {
	it('area is positive counter-clockwise and negative the other way', () => {
		expect(outlineArea(square(0, 0, 4))).toBe(16);
		expect(outlineArea({ points: [...square(0, 0, 4).points].reverse() })).toBe(-16);
	});

	it('says whether a point is inside (even-odd), and treats a point far outside as outside', () => {
		const s = square(0, 0, 10);
		expect(pointInOutline(s, [5, 5])).toBe(true);
		expect(pointInOutline(s, [15, 5])).toBe(false);
		expect(pointInOutline(s, [-0.1, 5])).toBe(false);
		const l: SketchOutline = {
			points: [
				[0, 0],
				[10, 0],
				[10, 4],
				[4, 4],
				[4, 10],
				[0, 10],
			],
		};
		expect(pointInOutline(l, [2, 8])).toBe(true);
		expect(pointInOutline(l, [8, 8])).toBe(false);
	});
});

describe('sketchHits: which outline is under a point (the smallest, so a hole is reachable inside its plate)', () => {
	it('lists them smallest first', () => {
		const sketch = { outlines: [square(0, 0, 20), square(5, 5, 4)] };
		expect(sketchHits(sketch, [6, 6])).toEqual([1, 0]);
		expect(sketchHits(sketch, [15, 15])).toEqual([0]);
		expect(sketchHits(sketch, [30, 30])).toEqual([]);
	});
});

describe('normalizeSketch', () => {
	it('puts the middle of the drawing at the origin and says where it was and how big it is', () => {
		const out = normalizeSketch([square(10, 20, 30)])!;
		expect(out.centre).toEqual([25, 35]);
		expect(out.width).toBe(30);
		expect(out.depth).toBe(30);
		expect(sketchBox(out.sketch)).toEqual({ min: [-15, -15], max: [15, 15], width: 30, depth: 30 });
	});

	it('drops what is not an area: fewer than three points, a repeat of the first point at the end, points on top of each other, no area at all', () => {
		const withRepeats: SketchOutline = { points: [...square(0, 0, 10).points, [0, 0], [0, 0]] };
		const out = normalizeSketch([
			withRepeats,
			{
				points: [
					[0, 0],
					[5, 5],
				],
			},
			{
				points: [
					[0, 0],
					[5, 5],
					[10, 10],
				],
			},
			{
				points: [
					[1, 1],
					[1, 1],
					[1, 1],
				],
			},
		])!;
		expect(out.sketch.outlines).toHaveLength(1);
		expect(out.sketch.outlines[0]!.points).toHaveLength(4);
	});

	it('is null when nothing is left, or a coordinate is not a number or is absurdly far', () => {
		expect(normalizeSketch([])).toBeNull();
		expect(
			normalizeSketch([
				{
					points: [
						[0, 0],
						[1, 0],
					],
				},
			]),
		).toBeNull();
		expect(
			normalizeSketch([
				{
					points: [
						[0, 0],
						[Number.NaN, 0],
						[0, 1],
					],
				},
			]),
		).toBeNull();
		expect(
			normalizeSketch([
				{
					points: [
						[0, 0],
						[1e9, 0],
						[0, 1],
					],
				},
			]),
		).toBeNull();
	});

	it('is null for an outline too small or too big to be a shape (a Shape may be 0.1 to 1000 mm)', () => {
		expect(normalizeSketch([square(0, 0, 0.01)])).toBeNull();
		expect(normalizeSketch([square(0, 0, 1500)])).toBeNull();
		expect(normalizeSketch([square(0, 0, 0.5)])).not.toBeNull();
	});

	it('keeps the limits: too many outlines or points are refused, not cut off', () => {
		const many = Array.from({ length: MAX_SKETCH_OUTLINES + 1 }, (_, i) => square(i * 3, 0, 2));
		expect(normalizeSketch(many)).toBeNull();
		const long: SketchOutline = {
			points: Array.from({ length: MAX_SKETCH_POINTS + 1 }, (_, i) => [Math.cos(i), Math.sin(i)] as [number, number]),
		};
		expect(normalizeSketch([long])).toBeNull();
	});

	it('does not change what it is given', () => {
		const input = [square(10, 20, 30)];
		const copy = JSON.stringify(input);
		normalizeSketch(input);
		expect(JSON.stringify(input)).toBe(copy);
	});
});

describe('outlines with curves', () => {
	/** A half-disc "D": a half circle of radius 10 below the x axis and the chord back along it. */
	const dShape = (): SketchOutline => ({
		points: [
			[-10, 0],
			[10, 0],
		],
		segments: [1, 'line'],
	});

	it('count an outline of two points as a shape when one side is an arc, with the area of the curve', () => {
		expect(outlineArea(dShape())).toBeCloseTo((Math.PI * 100) / 2, 0);
		expect(pointInOutline(dShape(), [0, -5])).toBe(true);
		expect(pointInOutline(dShape(), [0, 5])).toBe(false);
		expect(pointInOutline(dShape(), [0, -9.9])).toBe(true);
		expect(pointInOutline(dShape(), [0, -10.1])).toBe(false); // out past the arc, where the corners alone would not say
	});

	it('find a hole by the curve, not by the corners', () => {
		const sketch = { outlines: [circleOutline([0, 0], 20), circleOutline([0, 0], 5)] };
		expect(sketchHits(sketch, [0, 0])).toEqual([1, 0]);
		expect(sketchHits(sketch, [12, 12])).toEqual([0]); // inside the corner box of the big circle but outside the circle (distance 17)? no, 17 < 20
		expect(sketchHits(sketch, [15, 15])).toEqual([]); // 21 from the middle: outside the circle, inside its corner box
	});

	it('are boxed by where the curve goes, not the points: a D under the axis is 20 wide and 10 deep', () => {
		const box = sketchBox({ outlines: [dShape()] });
		expect(box.width).toBeCloseTo(20, 6);
		expect(box.depth).toBeCloseTo(10, 1);
		expect(box.min[1]).toBeCloseTo(-10, 1);
		expect(box.max[1]).toBeCloseTo(0, 6);
	});

	it('are moved to the origin by their curve: a D’s box middle is at its centre, and the sides stay', () => {
		const out = normalizeSketch([dShape()])!;
		expect(out.centre[0]).toBeCloseTo(0, 6);
		expect(out.centre[1]).toBeCloseTo(-5, 1);
		expect(out.sketch.outlines[0]!.segments).toEqual([1, 'line']);
		expect(out.sketch.outlines[0]!.points[0]![1]).toBeCloseTo(5, 1);
		expect(out.width).toBeCloseTo(20, 6);
	});

	it('keep their sides lined up with their points when a repeated point is taken out', () => {
		const out = normalizeSketch([
			{
				points: [
					[0, 0],
					[0, 0],
					[10, 0],
					[10, 10],
					[0, 10],
					[0, 0],
				],
				segments: ['line', 0.5, 'curve', 'line', 'line', 'line'],
			},
		])!;
		const o = out.sketch.outlines[0]!;
		expect(o.points).toHaveLength(4);
		expect(o.segments).toEqual([0.5, 'curve', 'line', 'line']);
	});

	it('lose the segments when they are all lines (so the plain polygons stay as they were), and treat missing ones as lines', () => {
		const out = normalizeSketch([
			{
				points: [
					[0, 0],
					[10, 0],
					[10, 10],
				],
				segments: ['line', 'line', 'line'],
			},
			{
				points: [
					[20, 0],
					[30, 0],
					[30, 10],
				],
				segments: [0.5],
			},
		])!;
		expect(out.sketch.outlines[0]!.segments).toBeUndefined();
		expect(out.sketch.outlines[1]!.segments).toEqual([0.5, 'line', 'line']);
	});

	it('are refused for a side that is not a line, a curve or a bulge within the limit', () => {
		const bad = (segment: unknown) =>
			normalizeSketch([
				{
					points: [
						[0, 0],
						[10, 0],
						[10, 10],
					],
					segments: [segment, 'line', 'line'] as never,
				},
			]);
		expect(bad(5)).toBeNull();
		expect(bad(Number.NaN)).toBeNull();
		expect(bad('arc')).toBeNull();
		expect(bad(-4)).not.toBeNull();
		expect(bad(0.3)).not.toBeNull();
	});

	it('clear an arc that is flat enough to be a line, and an outline that has fewer than two points or no area even with curves', () => {
		const flatArc = normalizeSketch([
			{
				points: [
					[0, 0],
					[10, 0],
					[10, 10],
				],
				segments: [1e-6, 'line', 'line'],
			},
		])!;
		expect(flatArc.sketch.outlines[0]!.segments).toBeUndefined();
		expect(normalizeSketch([{ points: [[0, 0]], segments: [1] }])).toBeNull();
		expect(
			normalizeSketch([
				{
					points: [
						[0, 0],
						[10, 0],
					],
					segments: ['line', 'line'],
				},
			]),
		).toBeNull(); // two points and only lines: no area
		expect(
			normalizeSketch([
				{
					points: [
						[0, 0],
						[10, 0],
					],
					segments: [1, 'line'],
				},
			]),
		).not.toBeNull();
	});
});
