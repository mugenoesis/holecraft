import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type ShapeNode } from './design.ts';
import { setNodeEuler } from './edit.ts';
import { groupNodes } from './groups.ts';
import { groupGeometry, setGroupSize } from './groupTransform.ts';
import { addShape } from './ops.ts';
import { setShapeParam } from './parametricShapes.ts';
import { setLocked } from './visibility.ts';

/** Two 20 mm boxes, one at x = 0 and one at x = 60, grouped: the group spans x -10..70 (80 wide), y -10..10, z 0..20. */
function pair(): { d: Design; g: string } {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 0], { id: 'b' }).design;
	const g = groupNodes(d, ['a', 'b'], { id: 'g' });
	return { d: g.design, g: g.id! };
}
const sizeOf = (d: Design, id: string) => {
	const p = (d.nodes[id] as ShapeNode).params;
	return [p.width, p.depth, p.height];
};

describe('setGroupSize', () => {
	it('stretches the contents to the typed width, depth or height, keeping the middle and the base', () => {
		const { d, g } = pair();
		const before = groupGeometry(d, g)!;
		expect([before.width, before.depth, before.height]).toEqual([80, 20, 20]);
		const wide = setGroupSize(d, g, { width: 160 });
		const after = groupGeometry(wide, g)!;
		expect([after.width, after.depth, after.height]).toEqual([160, 20, 20]);
		expect([after.x, after.y, after.z]).toEqual([before.x, before.y, before.z]);
		expect(sizeOf(wide, 'a')).toEqual([40, 20, 20]); // every shape inside stretched with it
		expect(sizeOf(wide, 'b')).toEqual([40, 20, 20]);
		const tall = setGroupSize(d, g, { depth: 40, height: 10 });
		expect(sizeOf(tall, 'a')).toEqual([20, 40, 10]);
	});

	it('changes nothing for the size it already is, and refuses what makes no sense', () => {
		const { d, g } = pair();
		expect(setGroupSize(d, g, { width: 80 })).toBe(d);
		expect(setGroupSize(d, g, {})).toBe(d);
		for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) expect(setGroupSize(d, g, { width: bad })).toBe(d);
		expect(setGroupSize(d, 'a', { width: 40 })).toBe(d); // not a group
		expect(setGroupSize(d, 'nope', { width: 40 })).toBe(d);
	});

	it('takes a typed size for a tipped group too, along its own axes', () => {
		const { d, g } = pair();
		const tipped = setNodeEuler(d, g, [30, 0, 0]);
		const out = setGroupSize(tipped, g, { width: 160 });
		expect(out).not.toBe(tipped);
		expect(groupGeometry(out, g)).toMatchObject({ width: 160, depth: 20, height: 20 });
	});

	it('refuses a locked group and one that holds a thread (it would stretch it)', () => {
		const { d, g } = pair();
		const locked = setLocked(d, [g], true);
		expect(setGroupSize(locked, g, { width: 160 })).toBe(locked);
		let t = addShape(createEmptyDesign('d'), 'threaded-rod', [0, 0], { id: 'a' }).design;
		t = setShapeParam(t, 'a', 'size', 8);
		t = addShape(t, 'box', [30, 0], { id: 'b' }).design;
		const grouped = groupNodes(t, ['a', 'b'], { id: 'g' }).design;
		expect(setGroupSize(grouped, 'g', { height: 50 })).toBe(grouped);
	});

	it('is the same as dragging a handle to that size: the group’s box ends up the typed size from its current middle', () => {
		const { d, g } = pair();
		const typed = setGroupSize(d, g, { height: 40 });
		expect(groupGeometry(typed, g)).toMatchObject({ width: 80, depth: 20, height: 40, z: 0 });
		expect(typed.updatedAt).not.toBe('');
	});
});
