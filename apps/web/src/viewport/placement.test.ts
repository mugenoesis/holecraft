import { snapOnPlane, type Vec3, type WorkPlane } from '@holecraft/core';
import { describe, expect, it, vi } from 'vitest';
import { armsOnClick, placementTarget } from './placement.ts';
import type { Viewport } from './Viewport.ts';

const GRID = { size: [200, 200] as [number, number], snap: 5, visible: true } as never;
const PLANE: WorkPlane = { origin: [0, 0, 20], normal: [0, 0, 1] };

function viewportOver(floor: [number, number] | null, onPlane: Vec3 | null = null) {
	return {
		pickWorkplane: vi.fn(() => floor),
		pickPlane: vi.fn(() => onPlane),
	} as unknown as Pick<Viewport, 'pickWorkplane' | 'pickPlane'>;
}

describe('where on the plate a shape would be put down', () => {
	it('on the floor, snapped to the grid and kept inside the plate', () => {
		expect(placementTarget(viewportOver([12.4, 400]), 10, 20, GRID, null)).toEqual({ at: [10, 100] });
		expect(placementTarget(viewportOver([-3, 7.6]), 10, 20, GRID, null)).toEqual({ at: [-5, 10] });
	});

	it('is nothing when the pointer is over the sky', () => {
		expect(placementTarget(viewportOver(null), 10, 20, GRID, null)).toBeNull();
	});

	it('with a Workplane-tool plane, on that plane (snapped there), not on the floor', () => {
		const viewport = viewportOver([1, 1], [3.4, -6.2, 20]);
		expect(placementTarget(viewport, 10, 20, GRID, PLANE)).toEqual({ plane: PLANE, point: snapOnPlane(PLANE, [3.4, -6.2, 20], 5) });
		expect(viewport.pickWorkplane).not.toHaveBeenCalled();
	});

	it('is nothing when the pointer misses the plane', () => {
		expect(placementTarget(viewportOver([1, 1], null), 10, 20, GRID, PLANE)).toBeNull();
	});
});

describe('which pointers arm a shape instead of adding it at once', () => {
	it('a mouse and a pen do: they can aim', () => {
		expect(armsOnClick('mouse')).toBe(true);
		expect(armsOnClick('pen')).toBe(true);
	});

	it('a finger does not: a tap adds the shape straight away', () => {
		expect(armsOnClick('touch')).toBe(false);
	});

	it('a click with no pointer behind it (the keyboard) does not', () => {
		expect(armsOnClick('')).toBe(false);
	});
});
