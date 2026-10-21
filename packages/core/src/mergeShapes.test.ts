import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type ShapeNode } from './design.ts';
import { setNodeMode, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { canMerge, mergeShapes, whyNotMerge } from './mergeShapes.ts';
import { MESH_SHAPE_TYPE, type MeshShapeInput } from './meshShape.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { setHidden, setLocked } from './visibility.ts';

const REF = 'b'.repeat(64);

/** Four 20 mm boxes in a row: 'a' and 'b' close together, 'c' and 'd' further along, so the order and the places can be seen. */
function design(): Design {
	let d = createEmptyDesign('t');
	for (const [id, x] of [
		['a', 0],
		['b', 15],
		['c', 60],
		['d', 100],
	] as const) {
		d = addShape(d, 'box', [x, 0], { id }).design;
		d = setShapeSize(d, id, { width: 20, depth: 20, height: 20 });
	}
	return d;
}

const inputFor = (d: Design, id: string): MeshShapeInput => {
	const b = nodeBoundsIn(d, id)!;
	return { name: 'Merged', ref: REF, size: [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!] };
};

describe('whyNotMerge', () => {
	it('is null for two or more shapes, or for one group', () => {
		const d = design();
		expect(whyNotMerge(d, ['a', 'b'])).toBeNull();
		expect(whyNotMerge(d, ['a', 'b', 'c'])).toBeNull();
		const grouped = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		expect(whyNotMerge(grouped, ['g'])).toBeNull();
		expect(canMerge(grouped, ['g'])).toBe(true);
	});

	it('asks for two or more shapes when there are none or one', () => {
		const d = design();
		const ask = 'Select two or more shapes (or one group) to merge them into one solid.';
		expect(whyNotMerge(d, [])).toBe(ask);
		expect(whyNotMerge(d, ['a'])).toBe(ask);
		expect(whyNotMerge(d, ['nope'])).toBe(ask);
		expect(canMerge(d, ['a'])).toBe(false);
	});

	it('names a shape that is locked or hidden', () => {
		const d = design();
		expect(whyNotMerge(setLocked(d, ['b'], true), ['a', 'b'])).toMatch(/locked/i);
		expect(whyNotMerge(setHidden(d, ['b'], true), ['a', 'b'])).toMatch(/hidden/i);
	});

	it('needs at least one solid: holes alone make nothing', () => {
		let d = design();
		d = setNodeMode(d, ['a', 'b'], 'hole');
		expect(whyNotMerge(d, ['a', 'b'])).toMatch(/solid/i);
		expect(whyNotMerge(d, ['a', 'b', 'c'])).toBeNull();
	});
});

describe('mergeShapes', () => {
	it('replaces the selected shapes by one mesh shape where they were, filling the box round them', () => {
		const d = design();
		const box = groupNodes(d, ['a', 'b'], { id: 'tmp' }).design;
		const out = mergeShapes(d, ['a', 'b'], inputFor(box, 'tmp'), { id: 'm', groupId: 'g' });
		expect(out.id).toBe('m');
		expect(out.design.roots).toEqual(['m', 'c', 'd']);
		for (const gone of ['a', 'b', 'g']) expect(out.design.nodes[gone]).toBeUndefined();
		const node = out.design.nodes.m as ShapeNode;
		expect(node.shapeType).toBe(MESH_SHAPE_TYPE);
		expect(node.name).toBe('Merged');
		expect(node.params.mesh).toBe(REF);
		const before = nodeBoundsIn(box, 'tmp')!;
		const after = nodeBoundsIn(out.design, 'm')!;
		for (const k of [0, 1, 2]) {
			expect(after.min[k]).toBeCloseTo(before.min[k]!);
			expect(after.max[k]).toBeCloseTo(before.max[k]!);
		}
	});

	it('takes the place of the first of the selected shapes in the list', () => {
		const d = design();
		const box = groupNodes(d, ['b', 'd'], { id: 'tmp' }).design;
		const out = mergeShapes(d, ['d', 'b'], inputFor(box, 'tmp'), { id: 'm', groupId: 'g' });
		expect(out.design.roots).toEqual(['a', 'm', 'c']);
	});

	it('merges a group that is already made, and leaves the others alone', () => {
		const grouped = groupNodes(design(), ['a', 'b'], { id: 'g' }).design;
		const out = mergeShapes(grouped, ['g'], inputFor(grouped, 'g'), { id: 'm' });
		expect(out.design.roots).toEqual(['m', 'c', 'd']);
		expect(out.design.nodes.g).toBeUndefined();
		expect(out.design.nodes.a).toBeUndefined();
	});

	it('is one design: undoing it is going back to the one before (nothing else changes)', () => {
		const d = design();
		const box = groupNodes(d, ['a', 'b'], { id: 'tmp' }).design;
		const out = mergeShapes(d, ['a', 'b'], inputFor(box, 'tmp'), { id: 'm', groupId: 'g' });
		expect(Object.keys(out.design.nodes).sort()).toEqual(['c', 'd', 'm']);
		expect(out.design.nodes.c).toBe(d.nodes.c);
	});

	it('does nothing for a selection that cannot be merged', () => {
		const d = design();
		const out = mergeShapes(d, ['a'], inputFor(d, 'a'), { id: 'm' });
		expect(out.design).toBe(d);
		expect(out.id).toBeNull();
	});
});
