import { describe, expect, it } from 'vitest';
import type { SketchOutline, SketchPoint } from './sketch.ts';
import { arcCentre, arcMidpoint, bulgeThrough, flattenOutline, MAX_BULGE, segmentMidpoint, segmentsOf } from './sketchCurves.ts';

const close = (got: readonly number[], want: readonly number[], digits = 6) => {
	for (const [i, v] of got.entries()) expect(v).toBeCloseTo(want[i]!, digits);
};
const area = (p: SketchPoint[]) => p.reduce((s, [x, y], i) => s + (x * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * y), 0) / 2;

describe('bulgeThrough: the arc that passes through three points', () => {
	it('is +1 for a counter-clockwise semicircle and -1 the other way round', () => {
		expect(bulgeThrough([-1, 0], [0, -1], [1, 0])).toBeCloseTo(1, 9); // along the bottom, anticlockwise
		expect(bulgeThrough([-1, 0], [0, 1], [1, 0])).toBeCloseTo(-1, 9); // over the top, clockwise
	});

	it('is tan of a quarter of the angle it sweeps: a quarter circle is tan(22.5 degrees)', () => {
		const r = Math.SQRT1_2;
		expect(bulgeThrough([1, 0], [r, r], [0, 1])).toBeCloseTo(Math.tan(Math.PI / 8), 9);
		expect(bulgeThrough([0, 1], [r, r], [1, 0])).toBeCloseTo(-Math.tan(Math.PI / 8), 9);
	});

	it('is 0 for three points on a line, in order (a line, not an arc), and null for one that goes out and back', () => {
		expect(bulgeThrough([0, 0], [5, 0], [10, 0])).toBe(0);
		expect(bulgeThrough([0, 0], [15, 0], [10, 0])).toBeNull();
		expect(bulgeThrough([0, 0], [0, 0], [10, 0])).toBeNull();
	});

	it('keeps to the biggest bulge allowed (a point right behind the start would be a full circle)', () => {
		const b = bulgeThrough([0, 0], [-0.001, 0.0001], [10, 0]);
		expect(b === null || Math.abs(b) <= MAX_BULGE).toBe(true);
		expect(MAX_BULGE).toBeGreaterThanOrEqual(1);
	});
});

describe('arcs from a bulge', () => {
	it('puts the middle of the arc on the point that was dragged out from the middle of the chord, for any chord direction and either side', () => {
		for (const [a, b, sag] of [
			[[-1, 0], [1, 0], 1],
			[[0, 0], [8, 2], 3],
			[[10, 10], [0, 2], -2.5],
			[[3, 3], [3, 9], 1.2],
		] as [SketchPoint, SketchPoint, number][]) {
			const chord = [b[0] - a[0], b[1] - a[1]];
			const len = Math.hypot(chord[0]!, chord[1]!);
			const mid: SketchPoint = [(a[0] + b[0]) / 2 + (chord[1]! / len) * sag, (a[1] + b[1]) / 2 - (chord[0]! / len) * sag]; // to the right of a to b for a positive sag
			const bulge = bulgeThrough(a, mid, b)!;
			expect(Math.sign(bulge)).toBe(Math.sign(sag));
			close(arcMidpoint(a, b, bulge), mid, 6);
		}
	});

	it('has its centre on the circle through the three points', () => {
		const a: SketchPoint = [0, 0];
		const m: SketchPoint = [3, 4];
		const b: SketchPoint = [8, 1];
		const c = arcCentre(a, b, bulgeThrough(a, m, b)!);
		const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
		expect(Math.hypot(m[0] - c[0], m[1] - c[1])).toBeCloseTo(r, 6);
		expect(Math.hypot(b[0] - c[0], b[1] - c[1])).toBeCloseTo(r, 6);
	});

	it('is a straight line for a bulge of 0 (the middle is the middle of the chord)', () => {
		close(arcMidpoint([0, 0], [10, 4], 0), [5, 2]);
	});
});

describe('flattenOutline', () => {
	const tol = 0.01;
	const dist = (a: SketchPoint, b: SketchPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

	it('is just the points for an outline with no curves, in the same order', () => {
		const o: SketchOutline = {
			points: [
				[0, 0],
				[10, 0],
				[10, 5],
			],
		};
		expect(flattenOutline(o, tol)).toEqual([
			[0, 0],
			[10, 0],
			[10, 5],
		]);
		expect(flattenOutline({ ...o, segments: ['line', 'line', 'line'] }, tol)).toEqual(o.points);
	});

	it('turns an arc into points on its circle, never more than the tolerance away from it, with its end points kept', () => {
		const o: SketchOutline = {
			points: [
				[-10, 0],
				[10, 0],
			],
			segments: [1, 'line'],
		}; // a half circle below, and the chord back
		const flat = flattenOutline(o, tol);
		expect(flat[0]).toEqual([-10, 0]);
		for (const p of flat.slice(1)) {
			if (Math.abs(p[1]) > 1e-9) expect(Math.abs(Math.hypot(p[0], p[1]) - 10)).toBeLessThan(1e-9);
		}
		// the straight pieces between those points stay within the tolerance of the circle: halfway between neighbours is nearer the centre by under tol
		for (let i = 0; i + 1 < flat.length - 1; i++) {
			const mid: SketchPoint = [(flat[i]![0] + flat[i + 1]![0]) / 2, (flat[i]![1] + flat[i + 1]![1]) / 2];
			expect(10 - Math.hypot(mid[0], mid[1])).toBeLessThanOrEqual(tol + 1e-9);
		}
		expect(flat.length).toBeGreaterThan(10);
		expect(flat.length).toBeLessThan(400);
	});

	it('keeps the area of a circle to within the tolerance: two semicircles of radius 10 are almost 100 pi', () => {
		const circle: SketchOutline = {
			points: [
				[-10, 0],
				[10, 0],
			],
			segments: [1, 1],
		};
		const a = area(flattenOutline(circle, tol));
		expect(a).toBeLessThan(Math.PI * 100);
		expect(a).toBeGreaterThan(Math.PI * 100 - 2 * Math.PI * 10 * tol * 1.5);
	});

	it('goes the right way round: a negative bulge bends the other way, and the half circle D has the area of half a circle', () => {
		const below = flattenOutline(
			{
				points: [
					[-10, 0],
					[10, 0],
				],
				segments: [1, 'line'],
			},
			tol,
		);
		const above = flattenOutline(
			{
				points: [
					[-10, 0],
					[10, 0],
				],
				segments: [-1, 'line'],
			},
			tol,
		);
		expect(Math.min(...below.map((p) => p[1]))).toBeCloseTo(-10, 1);
		expect(Math.max(...above.map((p) => p[1]))).toBeCloseTo(10, 1);
		expect(Math.abs(area(below))).toBeCloseTo((Math.PI * 100) / 2, 0);
	});

	it('makes a smooth curve through the points for curve segments: it passes through every point and has no corner where two curves meet', () => {
		const pts: SketchPoint[] = [
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 10],
		];
		const flat = flattenOutline({ points: pts, segments: ['curve', 'curve', 'curve', 'curve'] }, tol);
		for (const p of pts) expect(Math.min(...flat.map((q) => dist(q, p)))).toBeLessThan(1e-9);
		// a smooth closed curve through the corners of a square is rounder than the square: it bulges out past the sides and its area is not the square's
		expect(area(flat)).toBeGreaterThan(100);
		// no sharp turn at (10, 0): the direction in and out of it agree
		const at = flat.findIndex((q) => dist(q, [10, 0]) < 1e-9);
		const before = flat[at - 1]!;
		const after = flat[at + 1]!;
		const d1 = [10 - before[0], 0 - before[1]];
		const d2 = [after[0] - 10, after[1] - 0];
		const cos = (d1[0]! * d2[0]! + d1[1]! * d2[1]!) / (Math.hypot(d1[0]!, d1[1]!) * Math.hypot(d2[0]!, d2[1]!));
		expect(cos).toBeGreaterThan(0.99);
	});

	it('keeps a corner where a curve meets a straight side: the curve and the line only share their end point', () => {
		const pts: SketchPoint[] = [
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 10],
		];
		const flat = flattenOutline({ points: pts, segments: ['curve', 'line', 'line', 'line'] }, tol);
		const at = flat.findIndex((q) => dist(q, [10, 0]) < 1e-9);
		const before = flat[at - 1]!;
		const d1 = [10 - before[0], 0 - before[1]];
		const d2 = [0, 10];
		const cos = (d1[0]! * d2[0]! + d1[1]! * d2[1]!) / (Math.hypot(d1[0]!, d1[1]!) * Math.hypot(d2[0]!, d2[1]!));
		expect(cos).toBeLessThan(0.99); // a turn at the corner
	});

	it('uses more points for a tighter tolerance, and for a bigger circle', () => {
		const circle = (r: number): SketchOutline => ({
			points: [
				[-r, 0],
				[r, 0],
			],
			segments: [1, 1],
		});
		expect(flattenOutline(circle(10), 0.001).length).toBeGreaterThan(flattenOutline(circle(10), 0.1).length);
		expect(flattenOutline(circle(100), 0.01).length).toBeGreaterThan(flattenOutline(circle(5), 0.01).length);
	});

	it('copes with a tolerance that is zero, huge or not a number (it gives a sensible number of points, not hundreds of thousands)', () => {
		const circle: SketchOutline = {
			points: [
				[-10, 0],
				[10, 0],
			],
			segments: [1, 1],
		};
		for (const t of [0, -1, Number.NaN, 1e9]) {
			const n = flattenOutline(circle, t).length;
			expect(n).toBeGreaterThanOrEqual(4);
			expect(n).toBeLessThan(5000);
		}
	});
});

describe('segmentsOf and segmentMidpoint', () => {
	it('is a line for every side when the outline says nothing, and what it says otherwise', () => {
		expect(
			segmentsOf({
				points: [
					[0, 0],
					[1, 0],
					[1, 1],
				],
			}),
		).toEqual(['line', 'line', 'line']);
		expect(
			segmentsOf({
				points: [
					[0, 0],
					[1, 0],
					[1, 1],
				],
				segments: [0.5, 'curve', 'line'],
			}),
		).toEqual([0.5, 'curve', 'line']);
	});

	it('finds the middle of each kind of side: the chord’s middle, the arc’s, and the curve’s', () => {
		const o: SketchOutline = {
			points: [
				[0, 0],
				[10, 0],
				[10, 10],
				[0, 10],
			],
			segments: ['line', 1, 'curve', 'line'],
		};
		close(segmentMidpoint(o, 0), [5, 0]);
		close(segmentMidpoint(o, 1), [10 + Math.SQRT1_2 * 0 + 5 * 1 * 1, 5], 6); // a semicircle on a 10 mm chord bulges 5 mm to the right
		const curve = segmentMidpoint(o, 2);
		expect(curve[1]).toBeCloseTo(10, 0); // roughly along the top, between (10, 10) and (0, 10)
		expect(curve[0]).toBeGreaterThan(0);
		expect(curve[0]).toBeLessThan(10);
	});
});
