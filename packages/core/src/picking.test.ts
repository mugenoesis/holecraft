import { describe, expect, it } from 'vitest';
import { rayPlaneIntersection } from './picking.ts';

describe('rayPlaneIntersection (horizontal plane)', () => {
	it('hits the workplane from above', () => {
		expect(rayPlaneIntersection([0, 0, 10], [0, 0, -1])).toEqual([0, 0, 0]);
	});

	it('hits at an angle', () => {
		const p = rayPlaneIntersection([0, -10, 10], [0, 1, -1]);
		expect(p?.[0]).toBeCloseTo(0);
		expect(p?.[1]).toBeCloseTo(0);
		expect(p?.[2]).toBeCloseTo(0);
	});

	it('supports a plane at another height', () => {
		expect(rayPlaneIntersection([5, 5, 30], [0, 0, -1], 10)).toEqual([5, 5, 10]);
	});

	it('misses when the ray is parallel to the plane', () => {
		expect(rayPlaneIntersection([0, 0, 10], [1, 0, 0])).toBeNull();
	});

	it('misses when the plane is behind the ray', () => {
		expect(rayPlaneIntersection([0, 0, 10], [0, 0, 1])).toBeNull();
	});

	it('misses when the ray starts on the plane, as in an edge-on view', () => {
		expect(rayPlaneIntersection([0, -330, 0], [0, 0.99, -0.1])).toBeNull();
		expect(rayPlaneIntersection([0, -330, 0], [0, 0.99, 0.1])).toBeNull();
	});
});
