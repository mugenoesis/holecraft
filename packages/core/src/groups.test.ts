import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type GroupNode } from './design.ts';
import { moveNodes, setNodeEuler } from './edit.ts';
import { descendantIds, groupNodes, ungroupNodes } from './groups.ts';
import { multiplyMat4, transformPoint } from './mat4.ts';
import { addShape, nodeBoundsIn, translationOf } from './ops.ts';
import { composeTransform, eulerToMatrix } from './rotation.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	d = addShape(d, 'cylinder', [0, 50], { id: 'c' }).design;
	return d;
}

const group = (d: Design, id: string) => d.nodes[id] as GroupNode;
const pos = (d: Design, id: string) => translationOf(d.nodes[id]!.transform);

function close(actual: readonly number[], expected: readonly number[], digits = 6) {
	expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, digits));
}

describe('multiplyMat4 and transformPoint', () => {
	it('composes transforms so the right-hand one applies first', () => {
		const move = composeTransform([10, 0, 0], eulerToMatrix([0, 0, 0]));
		const turn = composeTransform([0, 0, 0], eulerToMatrix([0, 0, 90]));
		// Move then turn: the point (0,0,0) goes to (10,0,0), then is turned to (0,10,0).
		close(transformPoint(multiplyMat4(turn, move), [0, 0, 0]), [0, 10, 0]);
		// Turn then move: (0,0,0) stays, then shifts to (10,0,0).
		close(transformPoint(multiplyMat4(move, turn), [0, 0, 0]), [10, 0, 0]);
	});

	it('has the identity as a neutral element', () => {
		const m = composeTransform([1, 2, 3], eulerToMatrix([10, 20, 30]));
		const id = composeTransform([0, 0, 0], eulerToMatrix([0, 0, 0]));
		close(multiplyMat4(m, id), m, 12);
		close(multiplyMat4(id, m), m, 12);
	});
});

describe('groupNodes', () => {
	it("replaces the shapes in the root list with one group, in the first shape's place", () => {
		const { design, id } = groupNodes(scene(), ['c', 'a'], { id: 'g' });
		expect(id).toBe('g');
		expect(design.roots).toEqual(['g', 'b']);
		expect(group(design, 'g')).toMatchObject({ kind: 'group', name: 'Group 1', mode: 'solid', op: 'union', children: ['a', 'c'] });
	});

	it('keeps every shape exactly where it is', () => {
		const before = scene();
		const { design } = groupNodes(before, ['a', 'b'], { id: 'g' });
		expect(pos(design, 'a')).toEqual(pos(before, 'a'));
		expect(pos(design, 'b')).toEqual(pos(before, 'b'));
		expect(group(design, 'g').transform).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
	});

	it('needs at least two shapes', () => {
		const d = scene();
		expect(groupNodes(d, ['a'], { id: 'g' }).design).toBe(d);
		expect(groupNodes(d, [], { id: 'g' }).design).toBe(d);
		expect(groupNodes(d, ['a', 'nope'], { id: 'g' }).design).toBe(d);
	});

	it('skips locked shapes', () => {
		const d = scene();
		d.nodes.a!.locked = true;
		expect(groupNodes(d, ['a', 'b'], { id: 'g' }).design).toBe(d);
		expect(groupNodes(d, ['a', 'b', 'c'], { id: 'g' }).design.nodes.g).toMatchObject({ children: ['b', 'c'] });
	});

	it('numbers groups', () => {
		let d = groupNodes(scene(), ['a', 'b'], { id: 'g1' }).design;
		d = addShape(d, 'box', [0, 0], { id: 'x' }).design;
		d = addShape(d, 'box', [0, 0], { id: 'y' }).design;
		d = groupNodes(d, ['x', 'y'], { id: 'g2' }).design;
		expect(d.nodes.g2!.name).toBe('Group 2');
	});

	it('can group groups', () => {
		const inner = groupNodes(scene(), ['a', 'b'], { id: 'g1' }).design;
		const outer = groupNodes(inner, ['g1', 'c'], { id: 'g2' }).design;
		expect(outer.roots).toEqual(['g2']);
		expect(group(outer, 'g2').children).toEqual(['g1', 'c']);
	});

	it('does not mutate the original', () => {
		const d = scene();
		groupNodes(d, ['a', 'b'], { id: 'g' });
		expect(d.roots).toEqual(['a', 'b', 'c']);
		expect(d.nodes.g).toBeUndefined();
	});
});

describe('ungroupNodes', () => {
	it('puts the children back in the root list where the group was', () => {
		const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		const { design, ids } = ungroupNodes(grouped, ['g']);
		expect(ids).toEqual(['a', 'b']);
		expect(design.roots).toEqual(['a', 'b', 'c']);
		expect(design.nodes.g).toBeUndefined();
	});

	it('is lossless: group then ungroup gives back the same shapes, in the same order', () => {
		const before = scene();
		const { design } = ungroupNodes(groupNodes(before, ['a', 'b'], { id: 'g' }).design, ['g']);
		expect(design.roots).toEqual(before.roots);
		for (const id of before.roots) expect(design.nodes[id]).toEqual(before.nodes[id]);
	});

	it('keeps every shape unchanged even when the grouped shapes were not neighbours', () => {
		const before = scene();
		const { design } = ungroupNodes(groupNodes(before, ['a', 'c'], { id: 'g' }).design, ['g']);
		expect([...design.roots].sort()).toEqual([...before.roots].sort());
		for (const id of before.roots) expect(design.nodes[id]).toEqual(before.nodes[id]);
	});

	it('bakes a moved group into its children, so nothing jumps', () => {
		const grouped = moveNodes(groupNodes(scene(), ['a', 'b'], { id: 'g' }).design, ['g'], [7, -3, 0]);
		const { design } = ungroupNodes(grouped, ['g']);
		expect(pos(design, 'a')).toEqual([7, -3, 0]);
		expect(pos(design, 'b')).toEqual([57, -3, 0]);
	});

	it('bakes a turned group into its children', () => {
		const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		grouped.nodes.g!.transform = composeTransform([0, 0, 0], eulerToMatrix([0, 0, 90]));
		const { design } = ungroupNodes(grouped, ['g']);
		// b was at (50, 0); a quarter turn about Z takes it to (0, 50).
		close(pos(design, 'b'), [0, 50, 0]);
		// ...and the shape itself is now turned a quarter turn too.
		expect(design.nodes.b!.transform[1]).toBeCloseTo(1, 6);
	});

	it('makes the children holes when a hole group is ungrouped', () => {
		const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		grouped.nodes.g!.mode = 'hole';
		const { design } = ungroupNodes(grouped, ['g']);
		expect(design.nodes.a!.mode).toBe('hole');
		expect(design.nodes.b!.mode).toBe('hole');
	});

	it('only unpacks one level of nesting', () => {
		const inner = groupNodes(scene(), ['a', 'b'], { id: 'g1' }).design;
		const outer = groupNodes(inner, ['g1', 'c'], { id: 'g2' }).design;
		const { design, ids } = ungroupNodes(outer, ['g2']);
		expect(ids).toEqual(['g1', 'c']);
		expect(design.roots).toEqual(['g1', 'c']);
		expect(group(design, 'g1').children).toEqual(['a', 'b']);
	});

	it('ignores shapes and unknown ids, returning the same design', () => {
		const d = scene();
		expect(ungroupNodes(d, ['a', 'nope'])).toEqual({ design: d, ids: [] });
	});

	it('skips locked groups', () => {
		const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		grouped.nodes.g!.locked = true;
		expect(ungroupNodes(grouped, ['g']).ids).toEqual([]);
	});
});

describe('descendantIds', () => {
	it('lists everything inside a group, however deep', () => {
		const inner = groupNodes(scene(), ['a', 'b'], { id: 'g1' }).design;
		const outer = groupNodes(inner, ['g1', 'c'], { id: 'g2' }).design;
		expect(descendantIds(outer, 'g2').sort()).toEqual(['a', 'b', 'c', 'g1']);
		expect(descendantIds(outer, 'a')).toEqual([]);
	});
});

describe('nodeBoundsIn', () => {
	it("is the union of a group's solids", () => {
		const { design } = groupNodes(scene(), ['a', 'b'], { id: 'g' });
		expect(nodeBoundsIn(design, 'g')).toEqual({ min: [-10, -10, 0], max: [60, 10, 20] });
	});

	it('follows the group when it moves', () => {
		const moved = moveNodes(groupNodes(scene(), ['a', 'b'], { id: 'g' }).design, ['g'], [5, 5, 0]);
		expect(nodeBoundsIn(moved, 'g')).toEqual({ min: [-5, -5, 0], max: [65, 15, 20] });
	});

	it('follows the real shape of a turned group, not a loose box around it', () => {
		const grouped = groupNodes(scene(), ['a', 'c'], { id: 'g' }).design;
		grouped.nodes.g!.transform = composeTransform([0, 0, 0], eulerToMatrix([0, 0, 90]));
		const b = nodeBoundsIn(grouped, 'g')!;
		// a quarter turn takes a's footprint (-10..10 square at the origin) onto itself and c (0, 50) to (-50, 0).
		close(b.min, [-60, -10, 0]);
		close(b.max, [10, 10, 20]);
	});

	it('ignores hole children, but uses them when there is nothing else', () => {
		const grouped = groupNodes(scene(), ['a', 'b'], { id: 'g' }).design;
		grouped.nodes.b!.mode = 'hole';
		expect(nodeBoundsIn(grouped, 'g')).toEqual({ min: [-10, -10, 0], max: [10, 10, 20] });
		grouped.nodes.a!.mode = 'hole';
		expect(nodeBoundsIn(grouped, 'g')).toEqual({ min: [-10, -10, 0], max: [60, 10, 20] });
	});

	it('works for plain shapes and hidden nodes', () => {
		const d = scene();
		expect(nodeBoundsIn(d, 'a')).toEqual({ min: [-10, -10, 0], max: [10, 10, 20] });
		d.nodes.a!.hidden = true;
		expect(nodeBoundsIn(d, 'a')).toBeNull();
		expect(nodeBoundsIn(d, 'nope')).toBeNull();
	});

	it('handles nested groups', () => {
		const inner = groupNodes(scene(), ['a', 'b'], { id: 'g1' }).design;
		const outer = moveNodes(groupNodes(inner, ['g1', 'c'], { id: 'g2' }).design, ['g1'], [0, 100, 0]);
		// g1 (a and b) now sits 100 mm along Y, so the box runs from c's near edge (y 40) to g1's far edge (110).
		expect(nodeBoundsIn(outer, 'g2')).toEqual({ min: [-10, 40, 0], max: [60, 110, 20] });
	});
});

describe('rotation of a shape inside a group', () => {
	it('still reports its own orientation after being grouped', () => {
		const turned = setNodeEuler(scene(), 'a', [0, 0, 30]);
		const { design } = groupNodes(turned, ['a', 'b'], { id: 'g' });
		expect(design.nodes.a!.transform).toEqual(turned.nodes.a!.transform);
	});
});
