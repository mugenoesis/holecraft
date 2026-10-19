import { snapOnPlane, type Vec3, type WorkPlane } from '@holecraft/core';
import { describe, expect, it, vi } from 'vitest';
import { armsOnClick, placementTarget } from './placement.ts';
import type { Viewport } from './Viewport.ts';

const GRID = { size: [200, 200] as [number, number], snap: 5, visible: true } as never;
const PLANE: WorkPlane = { origin: [0, 0, 20], normal: [0, 0, 1] };

type Surface = { point: Vec3; normal: Vec3; id?: string } | null;

function viewportOver(floor: [number, number] | null, onPlane: Vec3 | null = null, surface: Surface = null) {
	return {
		pickWorkplane: vi.fn(() => floor),
		pickPlane: vi.fn(() => onPlane),
		pickSurface: vi.fn(() => surface),
	} as unknown as Pick<Viewport, 'pickWorkplane' | 'pickPlane' | 'pickSurface'>;
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

describe('where a shape is put down over another shape', () => {
	const top: Surface = { point: [10.4, 7.6, 20], normal: [0, 0, 1], id: 'a' };

	it('on the top of it: standing on that face, snapped to the world grid there', () => {
		expect(placementTarget(viewportOver([1, 1], null, top), 10, 20, GRID, null)).toEqual({
			plane: { origin: [0, 0, 20], normal: [0, 0, 1] },
			point: [10, 10, 20],
		});
	});

	it('on a wall: out of the wall, on the plane of that wall', () => {
		const wall: Surface = { point: [30, 12.2, 8], normal: [1, 0, 0], id: 'a' };
		const target = placementTarget(viewportOver([1, 1], null, wall), 10, 20, GRID, null);
		expect(target).not.toBeNull();
		if (!target || !('plane' in target)) throw new Error('expected a plane');
		expect(target.plane).toEqual({ origin: [30, 0, 0], normal: [1, 0, 0] });
		expect(target.point[0]).toBeCloseTo(30);
		expect(target.point).toEqual(snapOnPlane(target.plane, target.point, 5));
	});

	it('not on an underside: that falls back to the floor', () => {
		const under: Surface = { point: [10, 10, 5], normal: [0, 0, -1], id: 'a' };
		expect(placementTarget(viewportOver([12.4, 7.6], null, under), 10, 20, GRID, null)).toEqual({ at: [10, 10] });
	});

	it('on the bare floor (a hit with no shape): the floor, kept inside the plate', () => {
		const floor: Surface = { point: [12.4, 400, 0], normal: [0, 0, 1] };
		expect(placementTarget(viewportOver([12.4, 400], null, floor), 10, 20, GRID, null)).toEqual({ at: [10, 100] });
	});

	it('a Workplane-tool plane wins over the shape under the pointer', () => {
		const viewport = viewportOver([1, 1], [3.4, -6.2, 20], top);
		expect(placementTarget(viewport, 10, 20, GRID, PLANE)).toEqual({ plane: PLANE, point: snapOnPlane(PLANE, [3.4, -6.2, 20], 5) });
		expect(viewport.pickSurface).not.toHaveBeenCalled();
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
