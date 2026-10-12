import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { moveNodes, selectAll } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { hasHiddenNodes, setHidden, setLocked, showAll } from './visibility.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [50, 0], { id: 'b' }).design;
	d = addShape(d, 'box', [100, 0], { id: 'c' }).design;
	return d;
}

describe('setHidden', () => {
	it('hides and shows the given nodes only', () => {
		const hidden = setHidden(scene(), ['a', 'b'], true);
		expect([hidden.nodes.a!.hidden, hidden.nodes.b!.hidden, hidden.nodes.c!.hidden]).toEqual([true, true, false]);
		const shown = setHidden(hidden, ['a'], false);
		expect([shown.nodes.a!.hidden, shown.nodes.b!.hidden]).toEqual([false, true]);
	});

	it('returns the same design when nothing changes, and ignores unknown ids', () => {
		const d = scene();
		expect(setHidden(d, ['a'], false)).toBe(d);
		expect(setHidden(d, ['nope'], true)).toBe(d);
		expect(setHidden(d, [], true)).toBe(d);
	});

	it('a hidden object has no bounds, and Select all skips it', () => {
		const d = setHidden(scene(), ['b'], true);
		expect(nodeBoundsIn(d, 'b')).toBeNull();
		expect(selectAll(d)).toEqual(['a', 'c']);
	});

	it('hides a whole group at once', () => {
		const g = groupNodes(scene(), ['a', 'b']);
		const d = setHidden(g.design, [g.id!], true);
		expect(nodeBoundsIn(d, g.id!)).toBeNull();
	});
});

describe('setLocked', () => {
	it('locks and unlocks', () => {
		const locked = setLocked(scene(), ['a'], true);
		expect(locked.nodes.a!.locked).toBe(true);
		expect(setLocked(locked, ['a'], false).nodes.a!.locked).toBe(false);
	});

	it('a locked object cannot be moved', () => {
		const d = setLocked(scene(), ['a'], true);
		expect(moveNodes(d, ['a'], [5, 5, 0])).toBe(d);
	});

	it('returns the same design when nothing changes', () => {
		const d = scene();
		expect(setLocked(d, ['a'], false)).toBe(d);
	});
});

describe('showAll / hasHiddenNodes', () => {
	it('shows everything that was hidden in one go', () => {
		const d = setHidden(scene(), ['a', 'c'], true);
		expect(hasHiddenNodes(d)).toBe(true);
		const shown = showAll(d);
		expect(hasHiddenNodes(shown)).toBe(false);
		expect(showAll(shown)).toBe(shown);
	});

	it('also finds a hidden shape inside a group', () => {
		const g = groupNodes(scene(), ['a', 'b']);
		const d = { ...g.design, nodes: { ...g.design.nodes, a: { ...g.design.nodes.a!, hidden: true } } };
		expect(hasHiddenNodes(d)).toBe(true);
		expect(hasHiddenNodes(showAll(d))).toBe(false);
	});
});
