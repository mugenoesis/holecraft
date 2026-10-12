import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { addShape, shapeBounds, translationOf } from './ops.ts';
import { rotationOfTransform } from './rotation.ts';
import { addShapeOnPlane, isUsablePlane, planeCoords, planeFrame, planePoint, snapOnPlane, type WorkPlane } from './surfacePlane.ts';

const TOP: WorkPlane = { origin: [0, 0, 20], normal: [0, 0, 1] };
const WALL: WorkPlane = { origin: [10, 0, 10], normal: [1, 0, 0] };

const det = (r: number[]) =>
	r[0]! * (r[4]! * r[8]! - r[5]! * r[7]!) - r[1]! * (r[3]! * r[8]! - r[5]! * r[6]!) + r[2]! * (r[3]! * r[7]! - r[4]! * r[6]!);
const close = (a: readonly number[], b: readonly number[]) => {
	for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i]!, 6);
};

describe('planeFrame', () => {
	it('is the identity for a floor-like plane', () => {
		close(planeFrame([0, 0, 1]), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
	});

	it('turns local z to the normal, keeps local y pointing up on a wall, and is a proper rotation', () => {
		const r = planeFrame([1, 0, 0]);
		close([r[2]!, r[5]!, r[8]!], [1, 0, 0]); // local z column
		close([r[1]!, r[4]!, r[7]!], [0, 0, 1]); // local y column is world up
		expect(det(r)).toBeCloseTo(1);
	});

	it('is a proper rotation for any direction', () => {
		for (const n of [
			[0.3, -0.5, 0.8],
			[-1, 0, 0],
			[0, 1, 0],
			[0.7, 0.7, 0.14],
		]) {
			const len = Math.hypot(...n);
			const r = planeFrame(n.map((v) => v / len) as [number, number, number]);
			expect(det(r)).toBeCloseTo(1, 6);
		}
	});
});

describe('plane coordinates', () => {
	it('round-trips a point on the plane', () => {
		const p = planePoint(WALL, 3, 4);
		close(p, [10, 3, 14]);
		close(planeCoords(WALL, p), [3, 4]);
	});

	it('snaps to the grid measured from the plane origin', () => {
		close(snapOnPlane(TOP, [3.4, -6.2, 20], 5), [5, -5, 20]);
		close(snapOnPlane({ origin: [1, 1, 20], normal: [0, 0, 1] }, [3.4, 3.4, 20], 5), [1, 1, 20]); // 2.4 mm from the origin snaps to the origin
		close(snapOnPlane({ origin: [1, 1, 20], normal: [0, 0, 1] }, [4.4, 3.4, 20], 5), [6, 1, 20]);
	});

	it('does not snap when snapping is off', () => {
		close(snapOnPlane(TOP, [3.4, -6.2, 20], 0), [3.4, -6.2, 20]);
	});
});

describe('isUsablePlane', () => {
	it('accepts tops and sides, refuses undersides', () => {
		expect(isUsablePlane([0, 0, 1])).toBe(true);
		expect(isUsablePlane([1, 0, 0])).toBe(true);
		expect(isUsablePlane([0, 0, -1])).toBe(false);
		expect(isUsablePlane([0.1, 0, -0.995])).toBe(false);
	});
});

describe('addShapeOnPlane', () => {
	const empty = () => createEmptyDesign('d');

	it('stands a shape on a top face, base on the face', () => {
		const { design, id } = addShapeOnPlane(empty(), 'box', TOP, [4, 5, 20]);
		close(translationOf(design.nodes[id!]!.transform), [4, 5, 20]);
		close(rotationOfTransform(design.nodes[id!]!.transform), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
		expect(design.roots).toEqual([id]);
	});

	it('sticks a shape out of a side face', () => {
		const { design, id } = addShapeOnPlane(empty(), 'cylinder', WALL, [10, 0, 10]);
		const node = design.nodes[id!]!;
		if (node.kind !== 'shape') throw new Error('shape');
		const b = shapeBounds(node);
		expect(b.min[0]).toBeCloseTo(10); // starts at the wall
		expect(b.max[0]).toBeCloseTo(30); // 20 mm out
		expect(b.min[2]).toBeGreaterThanOrEqual(-1e-9);
	});

	it('never leaves a shape below the workplane', () => {
		const low: WorkPlane = { origin: [10, 0, 2], normal: [1, 0, 0] };
		const { design, id } = addShapeOnPlane(empty(), 'box', low, [10, 0, 2]);
		const node = design.nodes[id!]!;
		if (node.kind !== 'shape') throw new Error('shape');
		expect(shapeBounds(node).min[2]).toBeGreaterThanOrEqual(-1e-9);
	});

	it('numbers and names like any added shape', () => {
		const first = addShape(empty(), 'box', [0, 0]).design;
		const { design, id } = addShapeOnPlane(first, 'box', TOP, [0, 0, 20]);
		expect(design.nodes[id!]!.name).toBe('Box 2');
	});

	it('refuses an underside and does nothing', () => {
		const d = empty();
		const out = addShapeOnPlane(d, 'box', { origin: [0, 0, 5], normal: [0, 0, -1] }, [0, 0, 5]);
		expect(out.design).toBe(d);
		expect(out.id).toBeNull();
	});
});
