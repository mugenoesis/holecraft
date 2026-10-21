import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type GroupNode, type ShapeNode } from './design.ts';
import { setNodeEuler, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import {
	addResinHole,
	canAddResinHole,
	DEFAULT_DRAIN_DIAMETER,
	MAX_DRAIN_DIAMETER,
	MIN_DRAIN_DIAMETER,
	whyNotResinHole,
} from './resinHoles.ts';

/** A 20 mm box at (30, -10). */
function box(at: [number, number] = [30, -10]): Design {
	let d = createEmptyDesign('t');
	d = addShape(d, 'box', at, { id: 'b' }).design;
	return setShapeSize(d, 'b', { width: 20, depth: 20, height: 20 });
}

const group = (d: Design, id: string) => d.nodes[id] as GroupNode;
const holes = (d: Design, g: GroupNode) => g.children.map((c) => d.nodes[c]!).filter((n) => n.mode === 'hole') as ShapeNode[];

describe('addResinHole', () => {
	it('puts a drain hole at the bottom of the shape, as an ordinary cylinder hole grouped with it', () => {
		const out = addResinHole(box(), ['b'], 'drain', 3.5, { groupId: 'g', holeId: 'h' });
		expect(out.selection).toEqual(['g']);
		const g = group(out.design, 'g');
		expect(g.children).toEqual(['b', 'h']);
		expect(out.design.roots).toEqual(['g']);
		const hole = out.design.nodes.h as ShapeNode;
		expect(hole.shapeType).toBe('cylinder');
		expect(hole.mode).toBe('hole');
		expect(hole.name).toBe('Drain hole 1');
		expect(hole.params).toMatchObject({ width: 3.5, depth: 3.5 });
		const b = nodeBoundsIn(out.design, 'h')!;
		// in the middle of the box (x 20..40, y -20..0), from 1 mm below its bottom to 5 mm into it
		expect((b.min[0]! + b.max[0]!) / 2).toBeCloseTo(30);
		expect((b.min[1]! + b.max[1]!) / 2).toBeCloseTo(-10);
		expect(b.min[2]).toBeCloseTo(-1);
		expect(b.max[2]).toBeCloseTo(5);
	});

	it('puts a vent hole at the top', () => {
		const out = addResinHole(box(), ['b'], 'vent', 3.5, { groupId: 'g', holeId: 'h' });
		expect((out.design.nodes.h as ShapeNode).name).toBe('Vent hole 1');
		const b = nodeBoundsIn(out.design, 'h')!;
		expect(b.min[2]).toBeCloseTo(15); // 5 mm into the box from its top (20)
		expect(b.max[2]).toBeCloseTo(21); // and 1 mm out of it
	});

	it('goes as deep as a quarter of the height, between 3 and 15 mm, and never past the shape', () => {
		const depthOf = (height: number) => {
			const d = setShapeSize(box(), 'b', { height });
			const out = addResinHole(d, ['b'], 'vent', 3.5, { groupId: 'g', holeId: 'h' });
			const b = nodeBoundsIn(out.design, 'h')!;
			return nodeBoundsIn(out.design, 'b')!.max[2]! - b.min[2]!;
		};
		expect(depthOf(4)).toBeCloseTo(3); // a quarter would be 1: at least 3 ...
		expect(depthOf(2)).toBeCloseTo(2); // ... but not past the shape
		expect(depthOf(40)).toBeCloseTo(10);
		expect(depthOf(120)).toBeCloseTo(15); // at most 15
	});

	it('adds the second hole to the same group, not a group in a group', () => {
		const first = addResinHole(box(), ['b'], 'drain', 3.5, { groupId: 'g', holeId: 'h1' });
		const second = addResinHole(first.design, first.selection, 'vent', 4, { holeId: 'h2' });
		expect(second.selection).toEqual(['g']);
		expect(group(second.design, 'g').children).toEqual(['b', 'h1', 'h2']);
		expect(Object.values(second.design.nodes).filter((n) => n.kind === 'group')).toHaveLength(1);
		expect(holes(second.design, group(second.design, 'g')).map((h) => h.name)).toEqual(['Drain hole 1', 'Vent hole 1']);
	});

	it('numbers the holes of one kind', () => {
		const first = addResinHole(box(), ['b'], 'drain', 3.5, { groupId: 'g', holeId: 'h1' });
		const second = addResinHole(first.design, first.selection, 'drain', 3.5, { holeId: 'h2' });
		expect((second.design.nodes.h2 as ShapeNode).name).toBe('Drain hole 2');
	});

	it('wraps a group that is turned instead of adding into its frame', () => {
		let d = createEmptyDesign('t');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'box', [30, 0], { id: 'c' }).design;
		const made = groupNodes(d, ['a', 'c'], { id: 'turned' });
		d = setNodeEuler(made.design, 'turned', [0, 0, 30]);
		const out = addResinHole(d, ['turned'], 'drain', 3.5, { groupId: 'outer', holeId: 'h' });
		expect(out.selection).toEqual(['outer']);
		expect(group(out.design, 'outer').children).toEqual(['turned', 'h']);
		expect(group(out.design, 'turned').children).toEqual(['a', 'c']);
	});

	it('leaves the design alone for what cannot take a hole', () => {
		const d = box();
		expect(canAddResinHole(d, [])).toBe(false);
		expect(canAddResinHole(d, ['nope'])).toBe(false);
		expect(canAddResinHole(d, ['b'])).toBe(true);
		expect(addResinHole(d, [], 'drain', 3.5).design).toBe(d);
		const locked = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, locked: true } } };
		expect(canAddResinHole(locked, ['b'])).toBe(false);
		const hidden = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, hidden: true } } };
		expect(canAddResinHole(hidden, ['b'])).toBe(false);
		const aHole = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, mode: 'hole' as const } } };
		expect(canAddResinHole(aHole, ['b'])).toBe(false);
		const two = addShape(d, 'box', [100, 0], { id: 'c' }).design;
		expect(canAddResinHole(two, ['b', 'c'])).toBe(false);
	});

	it('keeps the diameter to what a hole can be', () => {
		expect(MIN_DRAIN_DIAMETER).toBeLessThan(DEFAULT_DRAIN_DIAMETER);
		expect(DEFAULT_DRAIN_DIAMETER).toBe(3.5);
		const tiny = addResinHole(box(), ['b'], 'drain', 0.01, { groupId: 'g', holeId: 'h' });
		expect((tiny.design.nodes.h as ShapeNode).params).toMatchObject({ width: MIN_DRAIN_DIAMETER });
		const huge = addResinHole(box(), ['b'], 'drain', 999, { groupId: 'g', holeId: 'h' });
		expect((huge.design.nodes.h as ShapeNode).params).toMatchObject({ width: MAX_DRAIN_DIAMETER });
		const odd = addResinHole(box(), ['b'], 'drain', Number.NaN, { groupId: 'g', holeId: 'h' });
		expect((odd.design.nodes.h as ShapeNode).params).toMatchObject({ width: DEFAULT_DRAIN_DIAMETER });
	});
});

describe('whyNotResinHole', () => {
	it('is null when a hole can be added', () => {
		expect(whyNotResinHole(box(), ['b'], 3.5)).toBeNull();
	});

	it('says what to select when nothing or several things are', () => {
		const d = box();
		expect(whyNotResinHole(d, [], 3.5)).toBe('Select one shape or group to add a drain or vent hole to it.');
		const two = addShape(d, 'box', [100, 0], { id: 'c' }).design;
		expect(whyNotResinHole(two, ['b', 'c'], 3.5)).toBe('Select one shape or group to add a drain or vent hole to it.');
	});

	it('names what is wrong with the selection: locked, hidden, a hole, or inside a group', () => {
		const d = box();
		const locked = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, locked: true } } };
		expect(whyNotResinHole(locked, ['b'], 3.5)).toMatch(/locked/i);
		const hidden = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, hidden: true } } };
		expect(whyNotResinHole(hidden, ['b'], 3.5)).toMatch(/hidden/i);
		const aHole = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, mode: 'hole' as const } } };
		expect(whyNotResinHole(aHole, ['b'], 3.5)).toMatch(/hole/i);
	});

	it('says the diameter range when the diameter is not one a hole can have', () => {
		const range = `The diameter must be between ${MIN_DRAIN_DIAMETER} and ${MAX_DRAIN_DIAMETER} mm.`;
		expect(whyNotResinHole(box(), ['b'], Number.NaN)).toBe(range);
		expect(whyNotResinHole(box(), ['b'], 0.1)).toBe(range);
		expect(whyNotResinHole(box(), ['b'], 31)).toBe(range);
	});

	it('agrees with canAddResinHole about everything but the diameter', () => {
		const d = box();
		for (const ids of [[], ['nope'], ['b']]) expect(whyNotResinHole(d, ids, 3.5) === null).toBe(canAddResinHole(d, ids));
	});
});
