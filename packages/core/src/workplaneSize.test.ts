import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { limitWorkplane, MAX_WORKPLANE_MM, MIN_WORKPLANE_MM, setWorkplaneSize, workplaneSpacing } from './workplaneSize.ts';

const design = () => createEmptyDesign('0123456789abcdef0123456789abcdef', 'D');

describe('the limits', () => {
	it('are 10 mm up to 100 cm, which is as big as a build plate may be', () => {
		expect(MIN_WORKPLANE_MM).toBe(10);
		expect(MAX_WORKPLANE_MM).toBe(1000);
	});
});

describe('limitWorkplane', () => {
	it('keeps a size that is within the limits, and rounds away float noise', () => {
		expect(limitWorkplane(250)).toBe(250);
		expect(limitWorkplane(256.5)).toBe(256.5);
		expect(limitWorkplane(0.1 + 0.2 + 100)).toBe(100.3);
	});

	it('brings one outside them back to the nearest limit', () => {
		expect(limitWorkplane(5)).toBe(10);
		expect(limitWorkplane(-40)).toBe(10);
		expect(limitWorkplane(1200)).toBe(1000);
		expect(limitWorkplane(Number.POSITIVE_INFINITY)).toBe(1000);
	});

	it('is null for something that is not a number', () => {
		expect(limitWorkplane(Number.NaN)).toBeNull();
	});
});

describe('setWorkplaneSize', () => {
	it('sets the width and depth, and leaves the snap alone', () => {
		const out = setWorkplaneSize(design(), 300, 250);
		expect(out.grid.size).toEqual([300, 250]);
		expect(out.grid.snap).toBe(design().grid.snap);
	});

	it('does not change the design it was given', () => {
		const before = design();
		setWorkplaneSize(before, 300, 300);
		expect(before.grid.size).toEqual([200, 200]);
	});

	it('limits a size that is too big or too small', () => {
		expect(setWorkplaneSize(design(), 5000, 1).grid.size).toEqual([1000, 10]);
	});

	it('is the same design for the size it already has, and for sizes that are not numbers', () => {
		const d = design();
		expect(setWorkplaneSize(d, 200, 200)).toBe(d);
		expect(setWorkplaneSize(d, Number.NaN, 300)).toBe(d);
		expect(setWorkplaneSize(d, 300, Number.NaN)).toBe(d);
		const big = setWorkplaneSize(d, 1000, 1000);
		expect(setWorkplaneSize(big, 99999, 99999)).toBe(big);
	});

	it('marks the design as changed', () => {
		const d = design();
		const out = setWorkplaneSize(d, 300, 300, new Date('2030-05-06T07:08:09Z'));
		expect(out.updatedAt).toBe('2030-05-06T07:08:09.000Z');
	});
});

describe('workplaneSpacing', () => {
	it('draws a line every millimetre, a stronger one every ten, on an ordinary plate', () => {
		expect(workplaneSpacing([200, 200])).toEqual({ minor: 1, major: 10 });
		expect(workplaneSpacing([400, 100])).toEqual({ minor: 1, major: 10 });
	});

	it('draws one every ten, and a stronger one every hundred, once the plate is bigger than that (a thousand fine lines would only be noise)', () => {
		expect(workplaneSpacing([401, 100])).toEqual({ minor: 10, major: 100 });
		expect(workplaneSpacing([1000, 1000])).toEqual({ minor: 10, major: 100 });
	});

	it('follows the larger side', () => {
		expect(workplaneSpacing([50, 900])).toEqual({ minor: 10, major: 100 });
	});
});
