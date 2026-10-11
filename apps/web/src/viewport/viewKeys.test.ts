import { nudgeDirections } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { nudgeForKey } from './viewKeys.ts';

describe('nudgeForKey', () => {
	const azimuths = [0, -0.6, Math.PI / 2, 2.5];

	it('is null for keys that are not arrows', () => {
		for (const key of ['Home', 'f', 'Enter', 'a', ' ']) expect(nudgeForKey(key, false, 1, 0)).toBeNull();
	});

	it('moves one snap step along the world axis closest to the arrow on screen', () => {
		for (const azimuth of azimuths) {
			const dirs = nudgeDirections(azimuth);
			expect(nudgeForKey('ArrowRight', false, 2, azimuth)).toEqual([dirs.right[0] * 2, dirs.right[1] * 2]);
			expect(nudgeForKey('ArrowUp', false, 2, azimuth)).toEqual([dirs.up[0] * 2, dirs.up[1] * 2]);
		}
	});

	it('Left and Down go the opposite way to Right and Up', () => {
		for (const azimuth of azimuths) {
			const right = nudgeForKey('ArrowRight', false, 1, azimuth)!;
			const left = nudgeForKey('ArrowLeft', false, 1, azimuth)!;
			expect(left[0]).toBeCloseTo(-right[0], 12);
			expect(left[1]).toBeCloseTo(-right[1], 12);
			const up = nudgeForKey('ArrowUp', false, 1, azimuth)!;
			const down = nudgeForKey('ArrowDown', false, 1, azimuth)!;
			expect(down[0]).toBeCloseTo(-up[0], 12);
			expect(down[1]).toBeCloseTo(-up[1], 12);
		}
	});

	it('Shift moves ten times as far', () => {
		const one = nudgeForKey('ArrowRight', false, 1, 0.3)!;
		const ten = nudgeForKey('ArrowRight', true, 1, 0.3)!;
		expect(ten[0]).toBeCloseTo(one[0] * 10, 12);
		expect(ten[1]).toBeCloseTo(one[1] * 10, 12);
	});

	it('uses 1 mm when snapping is off', () => {
		const dirs = nudgeDirections(0);
		expect(nudgeForKey('ArrowRight', false, 0, 0)).toEqual([dirs.right[0], dirs.right[1]]);
	});
});
