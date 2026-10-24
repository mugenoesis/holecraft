import { describe, expect, it } from 'vitest';
import type { Bounds } from './camera.ts';
import { nextTurn, type ZeroTurns, zeroArms, zeroOffsets, zeroSign, zeroStrips } from './zeroPoint.ts';

const box: Bounds = { min: [10, 20, 0], max: [30, 50, 15] };

describe('zeroOffsets', () => {
	it('measures from the zero point to the nearest corner of the bounds on x and y', () => {
		expect(zeroOffsets([0, 0], box)).toEqual({ x: 10, y: 20 });
	});

	it('is negative when the object lies left of or below the zero point', () => {
		expect(zeroOffsets([40, 60], box)).toEqual({ x: -10, y: -10 });
	});

	it('is zero for a point inside the bounds span, since the object covers it', () => {
		expect(zeroOffsets([20, 30], box)).toEqual({ x: 0, y: 0 });
	});
});

describe('zeroStrips', () => {
	it('runs one strip along x and one along y, from the zero point to the object', () => {
		expect(zeroStrips([0, 0], box)).toEqual([
			{ axis: 'x', from: [0, 20, 0], to: [10, 20, 0], length: 10 },
			{ axis: 'y', from: [10, 0, 0], to: [10, 20, 0], length: 20 },
		]);
	});

	it('leaves out an axis the object already covers', () => {
		expect(zeroStrips([20, 0], box).map((s) => s.axis)).toEqual(['y']);
	});
});

describe('the L at the zero point turns a quarter at a time', () => {
	it('nextTurn goes 0, 1, 2, 3 and back', () => {
		expect(([0, 1, 2, 3] as ZeroTurns[]).map(nextTurn)).toEqual([1, 2, 3, 0]);
	});

	it('arms point along +x and +y at first, then anticlockwise a quarter per turn', () => {
		expect(zeroArms([5, 5], 0, 10)).toEqual([
			[15, 5, 0],
			[5, 15, 0],
		]);
		expect(zeroArms([5, 5], 1, 10)).toEqual([
			[5, 15, 0],
			[-5, 5, 0],
		]);
		expect(zeroArms([5, 5], 2, 10)).toEqual([
			[-5, 5, 0],
			[5, -5, 0],
		]);
	});
});

describe('readings follow the L', () => {
	it('is +1 where an arm points along the world axis and -1 where it points against it', () => {
		expect(([0, 1, 2, 3] as const).map((t: ZeroTurns) => zeroSign(t, 'x'))).toEqual([1, -1, -1, 1]);
		expect(([0, 1, 2, 3] as const).map((t: ZeroTurns) => zeroSign(t, 'y'))).toEqual([1, 1, -1, -1]);
	});
});
