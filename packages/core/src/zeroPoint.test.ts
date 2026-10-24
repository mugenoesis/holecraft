import { describe, expect, it } from 'vitest';
import type { Bounds } from './camera.ts';
import { zeroOffsets, zeroStrips } from './zeroPoint.ts';

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
