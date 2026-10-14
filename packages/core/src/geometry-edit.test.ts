import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { dropToWorkplane, MAX_SHAPE_SIZE, setNodeEuler, setNodePosition, setShapeGeometry } from './edit.ts';
import { addShape, designBounds, translationOf } from './ops.ts';
import { rayVerticalPlaneIntersection } from './picking.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	return d;
}

const pos = (d: Design, id: string) => translationOf(d.nodes[id]!.transform);
const params = (d: Design, id: string) => {
	const n = d.nodes[id]!;
	return n.kind === 'shape' ? n.params : {};
};

describe('setNodePosition with a height', () => {
	it('sets Z along with X and Y', () => {
		expect(pos(setNodePosition(scene(), 'a', [1, 2, 15]), 'a')).toEqual([1, 2, 15]);
	});

	it('keeps the existing height when only X and Y are given', () => {
		const lifted = setNodePosition(scene(), 'a', [0, 0, 12]);
		expect(pos(setNodePosition(lifted, 'a', [5, 5]), 'a')).toEqual([5, 5, 12]);
	});

	it('rejects a negative or non-finite height', () => {
		const d = scene();
		expect(setNodePosition(d, 'a', [0, 0, -1])).toBe(d);
		expect(setNodePosition(d, 'a', [0, 0, Number.NaN])).toBe(d);
		expect(setNodePosition(d, 'a', [0, 0, Infinity])).toBe(d);
	});
});

describe('setShapeGeometry', () => {
	it('sets position, height above the plane and size in one edit', () => {
		const d = setShapeGeometry(scene(), 'a', { x: 5, y: 6, z: 7, width: 30, depth: 40, height: 50 });
		expect(pos(d, 'a')).toEqual([5, 6, 7]);
		expect(params(d, 'a')).toEqual({ width: 30, depth: 40, height: 50 });
	});

	it('returns the same design when nothing changes', () => {
		const d = scene();
		expect(setShapeGeometry(d, 'a', { x: 0, y: 0, z: 0, width: 20, depth: 20, height: 20 })).toBe(d);
	});

	it('rejects invalid sizes and heights without applying any of it', () => {
		const d = scene();
		const ok = { x: 5, y: 5, z: 0, width: 30, depth: 30, height: 30 };
		expect(setShapeGeometry(d, 'a', { ...ok, width: 0 })).toBe(d);
		expect(setShapeGeometry(d, 'a', { ...ok, depth: -1 })).toBe(d);
		expect(setShapeGeometry(d, 'a', { ...ok, height: MAX_SHAPE_SIZE + 1 })).toBe(d);
		expect(setShapeGeometry(d, 'a', { ...ok, z: -2 })).toBe(d);
		expect(setShapeGeometry(d, 'a', { ...ok, x: Number.NaN })).toBe(d);
	});

	it('lets a tilted shape\u2019s base centre dip below the workplane (its own resizing can take it there), but not an upright one', () => {
		const tilted = setNodeEuler(scene(), 'a', [90, 0, 0]);
		const g = { x: 0, y: 0, z: -5, width: 20, depth: 40, height: 20 };
		const resized = setShapeGeometry(tilted, 'a', g);
		expect(pos(resized, 'a')).toEqual([0, 0, -5]);
		expect(params(resized, 'a')).toEqual({ width: 20, depth: 40, height: 20 });
		expect(resized.nodes.a!.transform.slice(0, 3)).toEqual(tilted.nodes.a!.transform.slice(0, 3)); // still turned the same way
		const upright = scene();
		expect(setShapeGeometry(upright, 'a', g)).toBe(upright);
	});

	it('ignores locked and unknown shapes', () => {
		const d = scene();
		d.nodes.a!.locked = true;
		const g = { x: 1, y: 1, z: 0, width: 5, depth: 5, height: 5 };
		expect(setShapeGeometry(d, 'a', g)).toBe(d);
		expect(setShapeGeometry(d, 'nope', g)).toBe(d);
	});

	it('does not mutate the original', () => {
		const d = scene();
		setShapeGeometry(d, 'a', { x: 9, y: 9, z: 9, width: 9, depth: 9, height: 9 });
		expect(pos(d, 'a')).toEqual([0, 0, 0]);
		expect(params(d, 'a')).toEqual({ width: 20, depth: 20, height: 20 });
	});
});

describe('dropToWorkplane', () => {
	it('puts the selected shapes back on the workplane, keeping X and Y', () => {
		let d = setNodePosition(scene(), 'a', [3, 4, 25]);
		d = setNodePosition(d, 'b', [50, 0, 10]);
		const dropped = dropToWorkplane(d, ['a']);
		expect(pos(dropped, 'a')).toEqual([3, 4, 0]);
		expect(pos(dropped, 'b')).toEqual([50, 0, 10]);
	});

	it('returns the same design when everything is already down', () => {
		const d = scene();
		expect(dropToWorkplane(d, ['a', 'b'])).toBe(d);
		expect(dropToWorkplane(d, [])).toBe(d);
	});

	it('skips locked shapes', () => {
		const d = setNodePosition(scene(), 'a', [0, 0, 5]);
		d.nodes.a!.locked = true;
		expect(dropToWorkplane(d, ['a'])).toBe(d);
	});

	it('lets bounds follow lifted shapes', () => {
		const d = setNodePosition(scene(), 'a', [0, 0, 30]);
		expect(designBounds(d)!.max[2]).toBe(50);
		expect(designBounds(dropToWorkplane(d, ['a']))!.max[2]).toBe(20);
	});
});

describe('rayVerticalPlaneIntersection', () => {
	// A vertical plane through (10, 0) facing the camera at -Y: its normal is (0, -1).
	const through = { at: [10, 0] as [number, number], normal: [0, -1] as [number, number] };

	it('finds the height where the ray crosses the plane', () => {
		const hit = rayVerticalPlaneIntersection([10, -100, 0], [0, 1, 0.5], through.at, through.normal);
		expect(hit?.[0]).toBeCloseTo(10);
		expect(hit?.[1]).toBeCloseTo(0);
		expect(hit?.[2]).toBeCloseTo(50);
	});

	it('works for a downward ray', () => {
		const hit = rayVerticalPlaneIntersection([10, -100, 80], [0, 1, -0.5], through.at, through.normal);
		expect(hit?.[2]).toBeCloseTo(30);
	});

	it('misses when the ray runs parallel to the plane', () => {
		expect(rayVerticalPlaneIntersection([0, -100, 0], [1, 0, 0.2], through.at, through.normal)).toBeNull();
	});

	it('misses when the plane is behind the ray', () => {
		expect(rayVerticalPlaneIntersection([10, 100, 0], [0, 1, 0.5], through.at, through.normal)).toBeNull();
	});

	it('copes with a normal that is not unit length', () => {
		const hit = rayVerticalPlaneIntersection([10, -100, 0], [0, 1, 0.5], through.at, [0, -5]);
		expect(hit?.[2]).toBeCloseTo(50);
	});
});
