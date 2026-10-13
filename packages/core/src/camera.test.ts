import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import {
	applyViewPreset,
	cameraPosition,
	fitDistance,
	fitToBounds,
	HOME_VIEW,
	homeViewFor,
	lookAlongNormal,
	MAX_DISTANCE,
	MIN_DISTANCE,
	type OrbitState,
	orbit,
	pan,
	VIEW_PRESETS,
	viewRotation,
	zoom,
} from './camera.ts';
import { planeFrame } from './surfacePlane.ts';

const front: OrbitState = { target: [0, 0, 0], azimuth: 0, polar: Math.PI / 2, distance: 100 };

function expectVec(actual: readonly number[], expected: readonly number[]) {
	expect(actual).toHaveLength(expected.length);
	for (const [i, v] of expected.entries()) expect(actual[i]).toBeCloseTo(v, 6);
}

describe('cameraPosition (Z-up, azimuth 0 looks at the front from -Y)', () => {
	it('places the camera in front, right, behind and above', () => {
		expectVec(cameraPosition(front), [0, -100, 0]);
		expectVec(cameraPosition({ ...front, azimuth: Math.PI / 2 }), [100, 0, 0]);
		expectVec(cameraPosition({ ...front, azimuth: Math.PI }), [0, 100, 0]);
		expectVec(cameraPosition({ ...front, polar: 0.0001 }), [0, -0.01, 100]);
	});

	it('is relative to the target', () => {
		expectVec(cameraPosition({ ...front, target: [10, 20, 30] }), [10, -80, 30]);
	});
});

describe('orbit', () => {
	it('adds the deltas', () => {
		const s = orbit(front, 0.5, -0.25);
		expect(s.azimuth).toBeCloseTo(0.5);
		expect(s.polar).toBeCloseTo(Math.PI / 2 - 0.25);
	});

	it('never flips over the poles', () => {
		expect(orbit(front, 0, -10).polar).toBeGreaterThan(0);
		expect(orbit(front, 0, 10).polar).toBeLessThan(Math.PI);
	});

	it('does not mutate its input', () => {
		orbit(front, 1, 1);
		expect(front.azimuth).toBe(0);
	});
});

describe('zoom', () => {
	it('scales the distance', () => {
		expect(zoom(front, 0.5).distance).toBeCloseTo(50);
	});

	it('clamps to the allowed range', () => {
		expect(zoom(front, 1e-9).distance).toBe(MIN_DISTANCE);
		expect(zoom(front, 1e9).distance).toBe(MAX_DISTANCE);
	});
});

describe('pan', () => {
	const fov = 40;
	const heightPx = 800;
	const worldPerPx = (2 * 100 * Math.tan((fov * Math.PI) / 360)) / heightPx;

	it('drags the scene with the pointer: dragging right moves the target left', () => {
		const s = pan(front, 100, 0, heightPx, fov);
		expectVec(s.target, [-100 * worldPerPx, 0, 0]);
	});

	it('dragging down moves the target up', () => {
		const s = pan(front, 0, 50, heightPx, fov);
		expectVec(s.target, [0, 0, 50 * worldPerPx]);
	});

	it('pans in the screen plane from a rotated view', () => {
		const s = pan({ ...front, azimuth: Math.PI / 2 }, 100, 0, heightPx, fov);
		// Camera on +X looking at -X: screen-right is +Y, so the target moves to -Y.
		expectVec(s.target, [0, -100 * worldPerPx, 0]);
	});
});

describe('viewRotation', () => {
	it('returns right, up and back vectors as rows', () => {
		expectVec(viewRotation(front), [1, 0, 0, 0, 0, 1, 0, -1, 0]);
	});

	it('looking from the right, screen-right is +Y', () => {
		expectVec(viewRotation({ ...front, azimuth: Math.PI / 2 }), [0, 1, 0, 0, 0, 1, 1, 0, 0]);
	});

	it('is orthonormal for an arbitrary view', () => {
		const r = viewRotation(HOME_VIEW);
		const dot = (a: number, b: number) => [0, 1, 2].reduce((sum, k) => sum + r[a * 3 + k]! * r[b * 3 + k]!, 0);
		expect(dot(0, 0)).toBeCloseTo(1);
		expect(dot(1, 1)).toBeCloseTo(1);
		expect(dot(2, 2)).toBeCloseTo(1);
		expect(dot(0, 1)).toBeCloseTo(0);
		expect(dot(0, 2)).toBeCloseTo(0);
		expect(dot(1, 2)).toBeCloseTo(0);
	});

	it('is well-defined looking straight down', () => {
		const r = viewRotation({ ...front, polar: 0 });
		expect(r.every(Number.isFinite)).toBe(true);
	});
});

describe('fitDistance', () => {
	it('fits a sphere in a square view', () => {
		expect(fitDistance(10, 40, 1)).toBeCloseTo(10 / Math.sin((40 * Math.PI) / 360));
	});

	it('backs off further for narrow views', () => {
		expect(fitDistance(10, 40, 0.5)).toBeGreaterThan(fitDistance(10, 40, 1));
	});

	it('does not need extra distance for wide views', () => {
		expect(fitDistance(10, 40, 2)).toBeCloseTo(fitDistance(10, 40, 1));
	});
});

describe('fitToBounds', () => {
	it('centres the target on the bounds and frames them', () => {
		const s = fitToBounds(front, { min: [0, 0, 0], max: [20, 20, 20] }, 40, 1);
		expectVec(s.target, [10, 10, 10]);
		expect(s.distance).toBeGreaterThan(fitDistance(Math.sqrt(300), 40, 1) - 1e-9);
		expect(s.azimuth).toBe(front.azimuth);
	});

	it('never zooms in past the minimum distance for tiny objects', () => {
		const s = fitToBounds(front, { min: [0, 0, 0], max: [0.1, 0.1, 0.1] }, 40, 1);
		expect(s.distance).toBe(MIN_DISTANCE);
	});
});

describe('view presets', () => {
	it('has the six axis views plus an isometric one', () => {
		expect(Object.keys(VIEW_PRESETS).sort()).toEqual(['back', 'bottom', 'front', 'iso', 'left', 'right', 'top']);
	});

	it('puts the camera on the named side', () => {
		const at = (name: keyof typeof VIEW_PRESETS) => cameraPosition(applyViewPreset(front, name));
		expect(at('front')[1]).toBeLessThan(-99);
		expect(at('back')[1]).toBeGreaterThan(99);
		expect(at('right')[0]).toBeGreaterThan(99);
		expect(at('left')[0]).toBeLessThan(-99);
		expect(at('top')[2]).toBeGreaterThan(99);
		expect(at('bottom')[2]).toBeLessThan(-99);
	});

	it('keeps the target and distance', () => {
		const s = applyViewPreset({ ...front, target: [1, 2, 3], distance: 42 }, 'top');
		expect(s.target).toEqual([1, 2, 3]);
		expect(s.distance).toBe(42);
	});
});

describe('homeViewFor', () => {
	it('is the plain home view on wide windows', () => {
		expect(homeViewFor(1.6)).toEqual(HOME_VIEW);
		expect(homeViewFor(2.4)).toEqual(HOME_VIEW);
	});

	it('backs away on squarer and tall windows so the workplane still fits across', () => {
		expect(homeViewFor(1.2).distance).toBeGreaterThan(HOME_VIEW.distance);
		expect(homeViewFor(0.6).distance).toBeGreaterThan(homeViewFor(1.2).distance);
		expect(homeViewFor(1.0).distance).toBeCloseTo((HOME_VIEW.distance * 1.6) / 1.0);
	});

	it('keeps the same angle and target, and copes with nonsense', () => {
		const v = homeViewFor(1);
		expect([v.azimuth, v.polar, v.target]).toEqual([HOME_VIEW.azimuth, HOME_VIEW.polar, HOME_VIEW.target]);
		expect(homeViewFor(0)).toEqual(HOME_VIEW);
		expect(homeViewFor(Number.NaN)).toEqual(HOME_VIEW);
	});
});

describe('lookAlongNormal', () => {
	const rows = (s: OrbitState) => {
		const r = viewRotation(s);
		return { right: r.slice(0, 3), up: r.slice(3, 6), back: r.slice(6, 9) };
	};
	const close = (got: number[], want: number[]) => {
		for (const [i, v] of got.entries()) expect(v).toBeCloseTo(want[i]!, 2);
	};
	const base: OrbitState = { target: [1, 2, 3], azimuth: -0.6, polar: 1, distance: 100 };

	it('looks straight at a floor from above, with x to the right and y up the screen, as the plane’s own axes are', () => {
		const s = lookAlongNormal(base, [0, 0, 1], [5, 6, 0], 200);
		const { right, up, back } = rows(s);
		close(right, [1, 0, 0]);
		close(up, [0, 1, 0]);
		close(back, [0, 0, 1]);
		expect(s.target).toEqual([5, 6, 0]);
		expect(s.distance).toBe(200);
	});

	it('looks straight at any face: the camera is on the normal’s side, right is the plane’s x and up is its y (up the wall on a wall)', () => {
		for (const n of [
			[0, -1, 0],
			[1, 0, 0],
			[0, 1, 0],
			[-1, 0, 0],
			[0.6, 0.8, 0],
			[0.5, 0.5, Math.SQRT1_2],
		] as Vec3[]) {
			const unit = n.map((v) => v / Math.hypot(...n)) as Vec3;
			const { right, up, back } = rows(lookAlongNormal(base, unit, [0, 0, 0], 100));
			const frame = planeFrame(unit); // row-major: columns are the plane's x, y and normal
			close(back, unit);
			close(right, [frame[0]!, frame[3]!, frame[6]!]);
			close(up, [frame[1]!, frame[4]!, frame[7]!]);
		}
	});

	it('keeps the distance when none is given, and copes with a normal that is not quite unit length', () => {
		expect(lookAlongNormal(base, [0, 0, 1], [0, 0, 0]).distance).toBe(100);
		close(rows(lookAlongNormal(base, [0, 0, 3], [0, 0, 0])).back, [0, 0, 1]);
	});
});
