import { describe, expect, it } from 'vitest';
import type { Bounds } from './camera.ts';
import { nextTurn, type ZeroTurns, zeroArms, zeroMoveDelta, zeroOffsets, zeroSign, zeroStrips } from './zeroPoint.ts';

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

describe('typing a reading moves the object to it', () => {
	// the box spans x 10 to 30 and y 20 to 50, the point is at the origin
	it('puts the near face at the typed distance', () => {
		expect(zeroMoveDelta([0, 0], box, 'x', 25, 0)).toBe(15);
		expect(zeroMoveDelta([0, 0], box, 'y', 5, 0)).toBe(-15);
	});

	it('follows the L: against an arm a typed positive reading lies on the other side', () => {
		// turned once, the x arm points against world x, so a reading of 25 is 25 mm to the left: the far face goes there
		expect(zeroMoveDelta([0, 0], box, 'x', 25, 1)).toBe(-55);
	});

	it('measures from the point, not the world origin', () => {
		expect(zeroMoveDelta([100, 0], box, 'x', 5, 0)).toBe(95);
	});

	it('moves nothing when the reading is already what was typed', () => {
		expect(zeroMoveDelta([0, 0], box, 'x', 10, 0)).toBe(0);
	});
});
