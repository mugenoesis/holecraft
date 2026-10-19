import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { moveNodes, setShapeSize } from './edit.ts';
import { addShape } from './ops.ts';
import {
	addSupportPoint,
	clearSupportPoints,
	exportObjectCount,
	MAX_SUPPORT_POINTS,
	moveSupportPoint,
	objectIndexOf,
	removeSupportPoint,
	setSupportPoints,
	setSupportRadius,
	supportPointsDocument,
	supportsKey,
	supportsStale,
} from './supportPoints.ts';
import { parseDesign } from './validate.ts';

/** A 20 mm box 'a' and a 10 mm box 'b', standing on the plane. */
function twoBoxes(): Design {
	let d = addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'a' }).design;
	d = setShapeSize(d, 'a', { width: 20, depth: 20, height: 20 });
	d = addShape(d, 'box', [50, 0], { id: 'b' }).design;
	return setShapeSize(d, 'b', { width: 10, depth: 10, height: 10 });
}

const ONE_OBJECT = {
	objects: [
		{
			points: [
				{ x: 1, y: 2, z: 0, radius: 0.4, type: 'island' as const },
				{ x: 3, y: 4, z: 0, radius: 0.5, type: 'slope' as const },
			],
		},
	],
};

describe('setSupportPoints', () => {
	it('takes the points the slicer made, with an id each and the object they belong to', () => {
		const d = setSupportPoints(twoBoxes(), {
			objects: [ONE_OBJECT.objects[0]!, { points: [{ x: 50, y: 0, z: 0, radius: 0.4, type: 'slope' }] }],
		});
		const points = d.supports!.points;
		expect(points).toHaveLength(3);
		expect(points.map((p) => p.object)).toEqual([0, 0, 1]);
		expect(points[0]).toMatchObject({ x: 1, y: 2, z: 0, radius: 0.4, type: 'island' });
		expect(new Set(points.map((p) => p.id)).size).toBe(3);
	});

	it('remembers the shapes the points were made for, so a change to them shows', () => {
		const d = setSupportPoints(twoBoxes(), ONE_OBJECT);
		expect(supportsStale(d)).toBe(false);
		expect(supportsStale(moveNodes(d, ['a'], [5, 0, 0]))).toBe(true);
		expect(supportsStale(setShapeSize(d, 'b', { width: 12, depth: 10, height: 10 }))).toBe(true);
	});

	it('is not stale for changes that do not touch the shape (a name, a colour, locking)', () => {
		const d = setSupportPoints(twoBoxes(), ONE_OBJECT);
		const renamed: Design = {
			...d,
			name: 'other',
			nodes: { ...d.nodes, a: { ...d.nodes.a!, name: 'Renamed', color: '#123456', locked: true } },
		};
		expect(supportsStale(renamed)).toBe(false);
	});

	it('has no points to be stale about before any are made', () => {
		expect(supportsStale(twoBoxes())).toBe(false);
	});

	it('replaces the points it had', () => {
		const first = setSupportPoints(twoBoxes(), ONE_OBJECT);
		const second = setSupportPoints(first, { objects: [{ points: [{ x: 9, y: 9, z: 0, radius: 0.4, type: 'island' }] }] });
		expect(second.supports!.points).toHaveLength(1);
	});

	it('refuses points that are not numbers, have no width, or are too many', () => {
		const d = twoBoxes();
		expect(setSupportPoints(d, { objects: [{ points: [{ x: Number.NaN, y: 0, z: 0, radius: 0.4, type: 'island' }] }] })).toBe(d);
		expect(setSupportPoints(d, { objects: [{ points: [{ x: 0, y: 0, z: 0, radius: 0, type: 'island' }] }] })).toBe(d);
		const many = {
			objects: [
				{ points: Array.from({ length: MAX_SUPPORT_POINTS + 1 }, () => ({ x: 0, y: 0, z: 0, radius: 0.4, type: 'island' as const })) },
			],
		};
		expect(setSupportPoints(d, many)).toBe(d);
	});
});

describe('editing the points', () => {
	const made = () => setSupportPoints(twoBoxes(), ONE_OBJECT);
	const firstId = (d: Design) => d.supports!.points[0]!.id;

	it('adds a point of your own, on the object it is on', () => {
		const d = addSupportPoint(made(), { object: 1, x: 50, y: 0, z: 10, radius: 0.4 }, { id: 'mine' });
		const added = d.supports!.points.find((p) => p.id === 'mine')!;
		expect(added).toMatchObject({ object: 1, x: 50, y: 0, z: 10, radius: 0.4, type: 'manual' });
		expect(d.supports!.points).toHaveLength(3);
		expect(d.supports!.key).toBe(made().supports!.key); // adding a point does not say the shapes were checked again
	});

	it('starts a set of points when there are none yet, for the shapes as they are', () => {
		const d = addSupportPoint(twoBoxes(), { object: 0, x: 0, y: 0, z: 0, radius: 0.4 }, { id: 'p' });
		expect(d.supports!.points).toHaveLength(1);
		expect(supportsStale(d)).toBe(false);
	});

	it('moves a point', () => {
		const d = made();
		const moved = moveSupportPoint(d, firstId(d), [7, 8, 9]);
		expect(moved.supports!.points[0]).toMatchObject({ x: 7, y: 8, z: 9 });
		expect(moved.supports!.points[1]).toEqual(d.supports!.points[1]);
	});

	it('changes the width of a point, kept between 0.1 and 10 mm', () => {
		const d = made();
		const id = firstId(d);
		expect(setSupportRadius(d, id, 0.8).supports!.points[0]!.radius).toBe(0.8);
		expect(setSupportRadius(d, id, 0.01).supports!.points[0]!.radius).toBe(0.1);
		expect(setSupportRadius(d, id, 99).supports!.points[0]!.radius).toBe(10);
	});

	it('removes a point', () => {
		const d = made();
		const out = removeSupportPoint(d, firstId(d));
		expect(out.supports!.points).toHaveLength(1);
	});

	it('removes all of them, leaving no set of points at all', () => {
		expect(clearSupportPoints(made()).supports).toBeUndefined();
	});

	it('gives the same design back when nothing changes', () => {
		const d = made();
		const id = firstId(d);
		expect(moveSupportPoint(d, 'nope', [1, 1, 1])).toBe(d);
		expect(moveSupportPoint(d, id, [1, 2, 0])).toBe(d); // where it already is
		expect(moveSupportPoint(d, id, [Number.NaN, 0, 0])).toBe(d);
		expect(setSupportRadius(d, id, 0.4)).toBe(d);
		expect(setSupportRadius(d, id, Number.NaN)).toBe(d);
		expect(removeSupportPoint(d, 'nope')).toBe(d);
		const plain = twoBoxes();
		expect(clearSupportPoints(plain)).toBe(plain); // nothing to clear: the same design back (not a rebuilt copy, whose timestamp could differ)
		const full = setSupportPoints(twoBoxes(), {
			objects: [{ points: Array.from({ length: MAX_SUPPORT_POINTS }, () => ({ x: 0, y: 0, z: 0, radius: 0.4, type: 'island' as const })) }],
		});
		expect(addSupportPoint(full, { object: 0, x: 0, y: 0, z: 0, radius: 0.4 })).toBe(full);
		expect(addSupportPoint(d, { object: 0, x: Number.NaN, y: 0, z: 0, radius: 0.4 })).toBe(d);
	});
});

describe('supportPointsDocument', () => {
	it('is what Trident takes: a list of points per object, in the order the objects are sent', () => {
		let d = setSupportPoints(twoBoxes(), ONE_OBJECT);
		d = addSupportPoint(d, { object: 1, x: 50, y: 0, z: 10, radius: 0.6 }, { id: 'x' });
		expect(supportPointsDocument(d, 2)).toEqual({
			objects: [
				{
					points: [
						{ x: 1, y: 2, z: 0, radius: 0.4, type: 'island' },
						{ x: 3, y: 4, z: 0, radius: 0.5, type: 'slope' },
					],
				},
				{ points: [{ x: 50, y: 0, z: 10, radius: 0.6, type: 'manual' }] },
			],
		});
	});

	it('has an empty list for an object with no points (it gets no supports)', () => {
		const d = setSupportPoints(twoBoxes(), ONE_OBJECT);
		expect(supportPointsDocument(d, 2)?.objects[1]).toEqual({ points: [] });
	});

	it('is null when there are no points', () => {
		expect(supportPointsDocument(twoBoxes(), 2)).toBeNull();
	});
});

describe('objectIndexOf', () => {
	it('numbers the shapes that are exported, in the order of the design', () => {
		const d = twoBoxes();
		expect(objectIndexOf(d, 'a')).toBe(0);
		expect(objectIndexOf(d, 'b')).toBe(1);
	});

	it('skips what is not exported: holes and hidden shapes', () => {
		const d = twoBoxes();
		const hiddenFirst: Design = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, hidden: true } } };
		expect(objectIndexOf(hiddenFirst, 'a')).toBeNull();
		expect(objectIndexOf(hiddenFirst, 'b')).toBe(0);
		const holeFirst: Design = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, mode: 'hole' } } };
		expect(objectIndexOf(holeFirst, 'a')).toBeNull();
		expect(objectIndexOf(holeFirst, 'b')).toBe(0);
		expect(objectIndexOf(d, 'missing')).toBeNull();
	});
});

describe('supportsKey', () => {
	it('is the same for the same shapes and changes when one moves', () => {
		expect(supportsKey(twoBoxes())).toBe(supportsKey(twoBoxes()));
		expect(supportsKey(moveNodes(twoBoxes(), ['b'], [1, 0, 0]))).not.toBe(supportsKey(twoBoxes()));
	});
});

describe('saving a design with support points', () => {
	it('keeps them, and the shapes they were made for, through save and load', () => {
		const d = addSupportPoint(setSupportPoints(twoBoxes(), ONE_OBJECT), { object: 0, x: 5, y: 5, z: 20, radius: 0.7 }, { id: 'mine' });
		const back = parseDesign(JSON.parse(JSON.stringify(d)));
		expect(back.supports).toEqual(d.supports);
		expect(supportsStale(back)).toBe(false);
	});

	it('loads designs saved before there were support points', () => {
		const old = JSON.parse(JSON.stringify(twoBoxes()));
		old.formatVersion = 7;
		delete old.supports;
		expect(parseDesign(old).supports).toBeUndefined();
	});

	it('refuses points that are not usable', () => {
		const d = JSON.parse(JSON.stringify(setSupportPoints(twoBoxes(), ONE_OBJECT)));
		d.supports.points[0].radius = -1;
		expect(() => parseDesign(d)).toThrow();
		const e = JSON.parse(JSON.stringify(setSupportPoints(twoBoxes(), ONE_OBJECT)));
		e.supports.points[0].x = 'far';
		expect(() => parseDesign(e)).toThrow();
		const f = JSON.parse(JSON.stringify(setSupportPoints(twoBoxes(), ONE_OBJECT)));
		f.supports.points[0].type = 'wild';
		expect(() => parseDesign(f)).toThrow();
	});
});

describe('exportObjectCount', () => {
	it('counts the objects an export has: visible solid top-level shapes and groups', () => {
		const d = twoBoxes();
		expect(exportObjectCount(d)).toBe(2);
		expect(exportObjectCount({ ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, hidden: true } } })).toBe(1);
		expect(exportObjectCount({ ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, mode: 'hole' } } })).toBe(1);
		expect(exportObjectCount(createEmptyDesign('e'))).toBe(0);
	});
});
