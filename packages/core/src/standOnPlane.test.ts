import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type ShapeNode } from './design.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { canStandOnPlane, standOnPlane, type WorkPlane } from './surfacePlane.ts';
import { setHidden, setLocked } from './visibility.ts';

/** A 20 mm box (centre 50, 0, 10) and the plane of a wall face at x = 10, which nothing in this test needs to exist. */
const wall: WorkPlane = { origin: [10, 0, 5], normal: [1, 0, 0] };
const top: WorkPlane = { origin: [0, 0, 30], normal: [0, 0, 1] };

function box(at: [number, number] = [50, 0]): Design {
	return addShape(createEmptyDesign('d'), 'box', at, { id: 'a' }).design;
}
const bounds = (d: Design, id = 'a') => {
	const b = nodeBoundsIn(d, id)!;
	return { min: b.min.map((v) => Math.round(v * 1e6) / 1e6), max: b.max.map((v) => Math.round(v * 1e6) / 1e6) };
};
const column = (d: Design, k: number) =>
	(d.nodes.a as ShapeNode).transform.slice(k * 4, k * 4 + 3).map((v) => Math.round(v * 1e6) / 1e6 + 0);

describe('standOnPlane', () => {
	it('puts a shape on a top face: its base on the surface, standing straight up, under where its middle was', () => {
		const out = standOnPlane(box(), 'a', top);
		expect(bounds(out)).toEqual({ min: [40, -10, 30], max: [60, 10, 50] });
		expect(column(out, 2)).toEqual([0, 0, 1]);
	});

	it('puts it on a wall: its base against the face, its height going out of it, the middle projected onto the face', () => {
		const out = standOnPlane(box(), 'a', wall);
		// base centre (10, 0, 10): the box's own y (its depth) is now up, and its height points along +x
		expect(bounds(out)).toEqual({ min: [10, -10, 0], max: [30, 10, 20] });
		expect(column(out, 2)).toEqual([1, 0, 0]); // its up is the face's normal
	});

	it('puts it on a slanted face: its up is the normal, and its base is on the plane', () => {
		const s = Math.SQRT1_2;
		const slope: WorkPlane = { origin: [0, 0, 40], normal: [s, 0, s] };
		const out = standOnPlane(box([0, 0]), 'a', slope); // its middle (0, 0, 10) is 21 mm under the plane
		const [nx, , nz] = column(out, 2);
		expect(nx).toBeCloseTo(s, 6);
		expect(nz).toBeCloseTo(s, 6);
		const [px, py, pz] = column(out, 3) as [number, number, number];
		expect(px * s + (pz - 40) * s).toBeCloseTo(0, 6); // the base centre is on the plane
		expect([px, py, pz]).toEqual([expect.closeTo(15, 5), 0, expect.closeTo(25, 5)]); // where the middle projects: 15 along x, 25 up
	});

	it('keeps the size, and raises what would end up under the floor', () => {
		const low = addShape(createEmptyDesign('d'), 'box', [50, 0], { id: 'a' }).design;
		// a wall plane whose base centre would be at z = 2: half the box (10 mm) would hang below the floor
		const out = standOnPlane(low, 'a', { origin: [10, 0, 2], normal: [1, 0, 0] });
		expect(bounds(out).min[2]).toBe(0);
		expect((out.nodes.a as ShapeNode).params).toMatchObject({ width: 20, depth: 20, height: 20 });
	});

	it('moves a group as one, keeping what is in it where it is relative to the rest', () => {
		let d = box([0, 0]);
		d = addShape(d, 'box', [40, 0], { id: 'b' }).design;
		d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		const [before] = [nodeBoundsIn(d, 'g')!];
		const out = standOnPlane(d, 'g', { origin: [100, 0, 5], normal: [1, 0, 0] });
		const after = nodeBoundsIn(out, 'g')!;
		expect(after.min[0]).toBeCloseTo(100, 6); // against the wall
		// the group was 60 long along x and is now 60 long along z (its own x is the wall's horizontal... here along y)
		const size = (b: { min: number[]; max: number[] }) => [0, 1, 2].map((k) => Math.round((b.max[k]! - b.min[k]!) * 1e6) / 1e6);
		expect(size(before).sort((x, y) => x - y)).toEqual([20, 20, 60]);
		expect(size(after).sort((x, y) => x - y)).toEqual([20, 20, 60]);
		expect(after.min[2]).toBeGreaterThanOrEqual(-1e-9);
	});

	it('refuses an underside, a locked shape, something that is not there, and a plane that is not a plane', () => {
		const d = box();
		expect(standOnPlane(d, 'a', { origin: [0, 0, 20], normal: [0, 0, -1] })).toBe(d);
		const locked = setLocked(d, ['a'], true);
		expect(standOnPlane(locked, 'a', top)).toBe(locked);
		expect(standOnPlane(d, 'nope', top)).toBe(d);
		expect(standOnPlane(d, 'a', { origin: [0, 0, 0], normal: [0, 0, 0] })).toBe(d);
	});

	it('is one change that, done twice, changes nothing the second time', () => {
		const once = standOnPlane(box(), 'a', wall);
		expect(standOnPlane(once, 'a', wall)).toBe(once);
		expect(standOnPlane(box(), 'a', wall, new Date('2031-02-03T04:05:06Z')).updatedAt).toBe('2031-02-03T04:05:06.000Z');
	});
});

describe('canStandOnPlane', () => {
	it('is for exactly one shape or group that can be changed and is on show', () => {
		const d = addShape(box(), 'box', [0, 40], { id: 'b' }).design;
		expect(canStandOnPlane(d, ['a'])).toBe(true);
		expect(canStandOnPlane(d, [])).toBe(false);
		expect(canStandOnPlane(d, ['a', 'b'])).toBe(false);
		expect(canStandOnPlane(d, ['nope'])).toBe(false);
		expect(canStandOnPlane(setLocked(d, ['a'], true), ['a'])).toBe(false);
		expect(canStandOnPlane(setHidden(d, ['a'], true), ['a'])).toBe(false);
	});
});
