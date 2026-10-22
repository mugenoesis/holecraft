import { describe, expect, it } from 'vitest';
import { clampCut, cutPlane, cutRange, defaultCut, XRAY_OFF, xrayFor } from './xray.ts';

const bounds = { min: [-10, -20, 0] as [number, number, number], max: [30, 20, 50] as [number, number, number] };

describe('XRAY_OFF', () => {
	it('is see-through off with no cut', () => {
		expect(XRAY_OFF).toEqual({ seeThrough: false, cut: null });
	});
});

describe('cutRange', () => {
	it('is the design’s extent along the axis', () => {
		expect(cutRange(bounds, 'x')).toEqual([-10, 30]);
		expect(cutRange(bounds, 'y')).toEqual([-20, 20]);
		expect(cutRange(bounds, 'z')).toEqual([0, 50]);
	});

	it('is a point for an empty design, so there is nothing to slide', () => {
		expect(cutRange(null, 'z')).toEqual([0, 0]);
	});
});

describe('defaultCut', () => {
	it('starts at the far end, where nothing is cut away yet', () => {
		expect(defaultCut(bounds, 'z')).toEqual({ axis: 'z', at: 50 });
		expect(defaultCut(bounds, 'x')).toEqual({ axis: 'x', at: 30 });
	});
});

describe('clampCut', () => {
	it('keeps the position within the extent, and a non-number at the far end', () => {
		expect(clampCut(bounds, { axis: 'z', at: 80 }).at).toBe(50);
		expect(clampCut(bounds, { axis: 'z', at: -5 }).at).toBe(0);
		expect(clampCut(bounds, { axis: 'z', at: 20 }).at).toBe(20);
		expect(clampCut(bounds, { axis: 'z', at: Number.NaN }).at).toBe(50);
	});
});

describe('cutPlane', () => {
	/** Whether a point is kept: a plane keeps what is on the side its normal points to (distance >= 0). */
	const kept = (cut: Parameters<typeof cutPlane>[0], p: [number, number, number]) => {
		const { normal, constant } = cutPlane(cut);
		return normal[0] * p[0] + normal[1] * p[1] + normal[2] * p[2] + constant >= 0;
	};

	it('keeps what is at or below the cut along z, and takes the top off', () => {
		const cut = { axis: 'z', at: 20 } as const;
		expect(kept(cut, [0, 0, 10])).toBe(true);
		expect(kept(cut, [0, 0, 20])).toBe(true);
		expect(kept(cut, [0, 0, 30])).toBe(false);
	});

	it('does the same along x and y', () => {
		expect(kept({ axis: 'x', at: 5 }, [4, 100, 100])).toBe(true);
		expect(kept({ axis: 'x', at: 5 }, [6, 0, 0])).toBe(false);
		expect(kept({ axis: 'y', at: -3 }, [0, -4, 9])).toBe(true);
		expect(kept({ axis: 'y', at: -3 }, [0, -2, 9])).toBe(false);
	});
});

describe('xrayFor', () => {
	const on = { on: true, seeThrough: true, axis: null, at: 0 } as const;

	it('is off while the X-ray switch is off, whatever else was chosen', () => {
		expect(xrayFor({ on: false, seeThrough: true, axis: 'z', at: 10 }, bounds)).toBe(XRAY_OFF);
	});

	it('is see-through with no cut when no axis is chosen', () => {
		expect(xrayFor(on, bounds)).toEqual({ seeThrough: true, cut: null });
	});

	it('can cut without being see-through', () => {
		expect(xrayFor({ ...on, seeThrough: false, axis: 'x', at: 5 }, bounds)).toEqual({ seeThrough: false, cut: { axis: 'x', at: 5 } });
	});

	it('keeps the cut inside the design, even after the design has changed', () => {
		expect(xrayFor({ ...on, axis: 'z', at: 500 }, bounds).cut).toEqual({ axis: 'z', at: 50 });
	});
});
