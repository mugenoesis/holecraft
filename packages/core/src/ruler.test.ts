import { describe, expect, it } from 'vitest';
import { formatLength, measureBetween, nextRuler, type RulerState, snapMeasuredPoint } from './ruler.ts';

describe('measureBetween', () => {
	it('gives the offset on each axis and the straight-line distance', () => {
		const m = measureBetween([0, 0, 0], [3, -4, 12]);
		expect(m.delta).toEqual([3, -4, 12]);
		expect(m.distance).toBeCloseTo(13);
	});

	it('is zero for the same point, and never negative', () => {
		expect(measureBetween([1, 2, 3], [1, 2, 3]).distance).toBe(0);
		expect(measureBetween([5, 5, 5], [0, 0, 0]).distance).toBeCloseTo(Math.hypot(5, 5, 5));
	});
});

describe('snapMeasuredPoint', () => {
	it('snaps x and y to the grid on the workplane, and leaves z at 0', () => {
		expect(snapMeasuredPoint([12.4, -7.6, 0], [0, 0, 1], 5)).toEqual([10, -10, 0]);
	});

	it('keeps points on a shape exact (rounded to a hundredth of a mm)', () => {
		expect(snapMeasuredPoint([12.3456, 7.891, 20], [1, 0, 0], 5)).toEqual([12.35, 7.89, 20]);
	});

	it('does not snap when snapping is off', () => {
		expect(snapMeasuredPoint([12.4, -7.6, 0], [0, 0, 1], 0)).toEqual([12.4, -7.6, 0]);
	});

	it('only snaps flat-on workplane points, not the top of a shape at z > 0', () => {
		expect(snapMeasuredPoint([12.4, -7.6, 20], [0, 0, 1], 5)).toEqual([12.4, -7.6, 20]);
	});

	it('does not produce -0', () => {
		expect(Object.is(snapMeasuredPoint([-0.2, 0, 0], [0, 0, 1], 5)[0], 0)).toBe(true);
	});
});

describe('formatLength', () => {
	it('shows millimetres with at most two decimals', () => {
		expect(formatLength(12.3456, 'mm')).toBe('12.35 mm');
		expect(formatLength(10, 'mm')).toBe('10 mm');
	});

	it('shows inches when asked', () => {
		expect(formatLength(25.4, 'in')).toBe('1 in');
		expect(formatLength(12.7, 'in')).toBe('0.5 in');
	});
});

describe('nextRuler', () => {
	const none: RulerState = { a: null, b: null };

	it('the first click sets the start, the second the end', () => {
		const one = nextRuler(none, [1, 2, 3]);
		expect(one).toEqual({ a: [1, 2, 3], b: null });
		expect(nextRuler(one, [4, 5, 6])).toEqual({ a: [1, 2, 3], b: [4, 5, 6] });
	});

	it('a click after a finished measurement starts a new one', () => {
		const done: RulerState = { a: [1, 2, 3], b: [4, 5, 6] };
		expect(nextRuler(done, [7, 8, 9])).toEqual({ a: [7, 8, 9], b: null });
	});
});
