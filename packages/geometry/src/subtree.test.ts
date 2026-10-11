import {
	addShape,
	createEmptyDesign,
	type Design,
	groupNodes,
	moveNodes,
	renameNode,
	setNodeColor,
	setNodeEuler,
	setNodeMode,
	setShapeSize,
} from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { rootSolidGroups, subtreeHash, subtreeOf } from './subtree.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
	d = addShape(d, 'sphere', [60, 0], { id: 's' }).design;
	d = groupNodes(d, ['a', 'h'], { id: 'g' }).design;
	return d;
}

const hash = (d: Design, id = 'g') => subtreeHash(d, id);

describe('subtreeHash', () => {
	it('is stable for the same content', () => {
		expect(hash(scene())).toBe(hash(scene()));
		expect(hash(scene())).toMatch(/^[0-9a-z]+$/);
	});

	it('changes when anything that affects the shape changes', () => {
		const base = hash(scene());
		expect(hash(setShapeSize(scene(), 'a', { width: 25 }))).not.toBe(base);
		expect(hash(moveNodes(scene(), ['a'], [1, 0, 0]))).not.toBe(base);
		expect(hash(setNodeEuler(scene(), 'a', [0, 0, 10]))).not.toBe(base);
		expect(hash(setNodeMode(scene(), ['h'], 'hole'))).not.toBe(base);
	});

	it('ignores things that do not affect the shape', () => {
		const base = hash(scene());
		expect(hash(renameNode(scene(), 'g', 'Bracket'))).toBe(base);
		expect(hash(renameNode(scene(), 'a', 'Plate'))).toBe(base);
		expect(hash(setNodeColor(scene(), ['g'], '#123456'))).toBe(base);
	});

	it("ignores where the group itself is, since results are in the group's own frame", () => {
		expect(hash(moveNodes(scene(), ['g'], [10, 20, 30]))).toBe(hash(scene()));
	});

	it('ignores whether the group itself is a hole', () => {
		expect(hash(setNodeMode(scene(), ['g'], 'hole'))).toBe(hash(scene()));
	});

	it('ignores shapes outside the group', () => {
		const base = hash(scene());
		expect(hash(moveNodes(scene(), ['s'], [5, 5, 0]))).toBe(base);
	});

	it('sees through nested groups', () => {
		let d = scene();
		d = groupNodes(d, ['g', 's'], { id: 'outer' }).design;
		const base = hash(d, 'outer');
		expect(hash(setShapeSize(d, 'a', { width: 30 }), 'outer')).not.toBe(base);
		expect(hash(moveNodes(d, ['g'], [1, 0, 0]), 'outer')).not.toBe(base);
	});

	it('distinguishes which child is the hole', () => {
		expect(hash(setNodeMode(scene(), ['a'], 'hole'))).not.toBe(hash(setNodeMode(scene(), ['h'], 'hole')));
	});
});

describe('subtreeOf', () => {
	it('contains the group and everything inside it, and nothing else', () => {
		const sub = subtreeOf(scene(), 'g');
		expect(sub.rootId).toBe('g');
		expect(Object.keys(sub.nodes).sort()).toEqual(['a', 'g', 'h']);
	});

	it('includes nested groups', () => {
		const d = groupNodes(scene(), ['g', 's'], { id: 'outer' }).design;
		expect(Object.keys(subtreeOf(d, 'outer').nodes).sort()).toEqual(['a', 'g', 'h', 'outer', 's']);
	});

	it('is plain data that survives structured cloning (it is sent to a worker)', () => {
		const sub = subtreeOf(scene(), 'g');
		expect(structuredClone(sub)).toEqual(sub);
	});

	it('is enough to evaluate the group by itself', () => {
		const sub = subtreeOf(scene(), 'g');
		expect(subtreeHash(sub, 'g')).toBe(hash(scene()));
	});
});

describe('rootSolidGroups', () => {
	it('lists top-level solid groups only', () => {
		let d = scene();
		expect(rootSolidGroups(d)).toEqual(['g']);
		d = groupNodes(d, ['g', 's'], { id: 'outer' }).design;
		expect(rootSolidGroups(d)).toEqual(['outer']); // the inner group is evaluated as part of it
	});

	it('skips hole groups, which are drawn as ghosts, and hidden groups', () => {
		expect(rootSolidGroups(setNodeMode(scene(), ['g'], 'hole'))).toEqual([]);
		const hidden = scene();
		hidden.nodes.g!.hidden = true;
		expect(rootSolidGroups(hidden)).toEqual([]);
	});

	it('is empty when there are no groups', () => {
		expect(rootSolidGroups(createEmptyDesign('d'))).toEqual([]);
	});
});
