import { describe, expect, it } from 'vitest';
import { axisVector, normalizeAngle, rayAnyPlaneIntersection, ringAngle, ringPoint, snapAngle } from './ring.ts';

const close = (a: readonly number[], b: readonly number[]) => b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, 9));

describe('axisVector', () => {
	it('returns the unit vector for each axis', () => {
		expect(axisVector('x')).toEqual([1, 0, 0]);
		expect(axisVector('y')).toEqual([0, 1, 0]);
		expect(axisVector('z')).toEqual([0, 0, 1]);
	});
});

describe('ringPoint and ringAngle', () => {
	const c: [number, number, number] = [10, 20, 30];

	it('puts angle 0 on the first in-plane axis and goes counter-clockwise about the axis', () => {
		close(ringPoint(c, 'z', 5, 0), [15, 20, 30]); // +X
		close(ringPoint(c, 'z', 5, Math.PI / 2), [10, 25, 30]); // +Y
		close(ringPoint(c, 'x', 5, 0), [10, 25, 30]); // +Y
		close(ringPoint(c, 'x', 5, Math.PI / 2), [10, 20, 35]); // +Z
		close(ringPoint(c, 'y', 5, 0), [10, 20, 35]); // +Z
		close(ringPoint(c, 'y', 5, Math.PI / 2), [15, 20, 30]); // +X
	});

	it('reads back the angle it was built from, for every axis', () => {
		for (const axis of ['x', 'y', 'z'] as const) {
			for (const a of [-3, -1.2, 0, 0.7, 2.9]) {
				expect(ringAngle(c, axis, ringPoint(c, axis, 12, a))).toBeCloseTo(a, 9);
			}
		}
	});

	it('ignores how far from the centre the point is, and any off-plane offset', () => {
		const a = ringAngle(c, 'z', [c[0] + 50, c[1] + 50, c[2] + 99]);
		expect(a).toBeCloseTo(Math.PI / 4, 9);
	});
});

describe('normalizeAngle', () => {
	it('wraps into (-π, π]', () => {
		expect(normalizeAngle(0)).toBe(0);
		expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
		expect(normalizeAngle((-3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2, 9);
		expect(normalizeAngle(2 * Math.PI + 0.1)).toBeCloseTo(0.1, 9);
	});

	it('takes the short way round a pointer crossing the ±π seam', () => {
		// From 170° to -170° is a 20° turn, not -340°.
		const delta = normalizeAngle((-170 * Math.PI) / 180 - (170 * Math.PI) / 180);
		expect(delta).toBeCloseTo((20 * Math.PI) / 180, 9);
	});
});

describe('snapAngle', () => {
	it('rounds to the nearest step, in degrees', () => {
		expect(snapAngle(12, 22.5)).toBe(22.5);
		expect(snapAngle(11, 22.5)).toBe(0);
		expect(snapAngle(-34, 22.5)).toBe(-45);
		expect(snapAngle(44.9, 22.5)).toBe(45);
	});

	it('leaves the angle alone when the step is 0', () => {
		expect(snapAngle(13.37, 0)).toBe(13.37);
	});

	it('does not return negative zero', () => {
		expect(Object.is(snapAngle(-1, 22.5), -0)).toBe(false);
	});
});

describe('rayAnyPlaneIntersection', () => {
	it('hits a tilted plane', () => {
		// Plane through the origin facing +X; ray along +X from the left.
		const hit = rayAnyPlaneIntersection([-10, 3, 4], [1, 0, 0], [0, 0, 0], [1, 0, 0]);
		close(hit!, [0, 3, 4]);
	});

	it('works with a plane not through the origin and a slanted ray', () => {
		const hit = rayAnyPlaneIntersection([0, 0, 0], [1, 1, 0], [5, 0, 0], [1, 0, 0]);
		close(hit!, [5, 5, 0]);
	});

	it('misses when parallel or when the plane is behind', () => {
		expect(rayAnyPlaneIntersection([0, 0, 0], [0, 1, 0], [5, 0, 0], [1, 0, 0])).toBeNull();
		expect(rayAnyPlaneIntersection([10, 0, 0], [1, 0, 0], [5, 0, 0], [1, 0, 0])).toBeNull();
	});

	it('accepts a normal that is not unit length', () => {
		const hit = rayAnyPlaneIntersection([-10, 0, 0], [1, 0, 0], [0, 0, 0], [7, 0, 0]);
		close(hit!, [0, 0, 0]);
	});
});
