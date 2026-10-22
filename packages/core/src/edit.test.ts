import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import {
	deleteNodes,
	duplicateNodes,
	MAX_SHAPE_SIZE,
	moveNodes,
	moveSelection,
	nudgeDirections,
	pruneSelection,
	renameNode,
	selectAll,
	setNodeColor,
	setNodePosition,
	setShapeSize,
	toggleSelection,
} from './edit.ts';
import { addShape, translationOf } from './ops.ts';

function scene(): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'cylinder', [50, 30], { id: 'b' }).design;
	d = addShape(d, 'sphere', [-40, 10], { id: 'c' }).design;
	return d;
}

const pos = (d: Design, id: string) => translationOf(d.nodes[id]!.transform);

describe('moveNodes', () => {
	it('moves only the given nodes by the delta', () => {
		const d = moveNodes(scene(), ['a', 'b'], [5, -5, 0]);
		expect(pos(d, 'a')).toEqual([5, -5, 0]);
		expect(pos(d, 'b')).toEqual([55, 25, 0]);
		expect(pos(d, 'c')).toEqual([-40, 10, 0]);
	});

	it('does not mutate the original', () => {
		const d = scene();
		moveNodes(d, ['a'], [9, 9, 0]);
		expect(pos(d, 'a')).toEqual([0, 0, 0]);
	});

	it('skips locked and unknown nodes', () => {
		const d = scene();
		d.nodes.a!.locked = true;
		const moved = moveNodes(d, ['a', 'nope'], [5, 5, 0]);
		expect(pos(moved, 'a')).toEqual([0, 0, 0]);
	});

	it('returns the same design when nothing moves', () => {
		const d = scene();
		expect(moveNodes(d, [], [1, 1, 0])).toBe(d);
		expect(moveNodes(d, ['a'], [0, 0, 0])).toBe(d);
	});
});

describe('moveSelection (drag with snapping)', () => {
	const opts = { snap: 5, size: [200, 200] as [number, number] };

	it('snaps the first selected shape to the grid and carries the rest with it', () => {
		const d = moveSelection(scene(), ['b', 'a'], [12, 3], opts);
		// Leader b starts at (50, 30): 62, 33 snaps to 60, 35, so the delta is (10, 5).
		expect(pos(d, 'b')).toEqual([60, 35, 0]);
		expect(pos(d, 'a')).toEqual([10, 5, 0]);
	});

	it('does not snap when snapping is off', () => {
		const d = moveSelection(scene(), ['a'], [1.234, 5.5], { ...opts, snap: 0 });
		expect(pos(d, 'a')).toEqual([1.234, 5.5, 0]);
	});

	it('keeps the leader inside the workplane', () => {
		const d = moveSelection(scene(), ['a'], [500, -500], opts);
		expect(pos(d, 'a')).toEqual([100, -100, 0]);
	});

	it('is relative to where the shapes are in the design passed in', () => {
		const base = scene();
		const first = moveSelection(base, ['a'], [10, 0], opts);
		const again = moveSelection(base, ['a'], [20, 0], opts);
		expect(pos(first, 'a')[0]).toBe(10);
		expect(pos(again, 'a')[0]).toBe(20);
	});
});

describe('setNodePosition', () => {
	it('takes a height below the workplane (the shape is then partly underground), within the size limit', () => {
		const d = setNodePosition(scene(), 'a', [1, 2, -3]);
		expect(d.nodes.a!.transform.slice(12, 15)).toEqual([1, 2, -3]);
		const far = scene();
		expect(setNodePosition(far, 'a', [0, 0, -MAX_SHAPE_SIZE - 1])).toBe(far);
	});

	it('sets X and Y, keeping the height above the plane', () => {
		const d = setNodePosition(scene(), 'a', [12.5, -3]);
		expect(pos(d, 'a')).toEqual([12.5, -3, 0]);
	});

	it('ignores non-finite values', () => {
		const d = scene();
		expect(setNodePosition(d, 'a', [Number.NaN, 1])).toBe(d);
		expect(setNodePosition(d, 'a', [1, Infinity])).toBe(d);
	});
});

describe('setShapeSize', () => {
	it('changes the given dimensions only', () => {
		const d = setShapeSize(scene(), 'a', { width: 40, height: 5 });
		expect(d.nodes.a).toMatchObject({ params: { width: 40, depth: 20, height: 5 } });
	});

	it('rejects zero, negative, non-finite and absurdly large sizes', () => {
		const d = scene();
		expect(setShapeSize(d, 'a', { width: 0 })).toBe(d);
		expect(setShapeSize(d, 'a', { depth: -3 })).toBe(d);
		expect(setShapeSize(d, 'a', { height: Number.NaN })).toBe(d);
		expect(setShapeSize(d, 'a', { width: 1e9 })).toBe(d);
	});

	it('applies the valid parts of a mixed request', () => {
		const d = setShapeSize(scene(), 'a', { width: 30, depth: -1 });
		expect(d.nodes.a).toMatchObject({ params: { width: 30, depth: 20 } });
	});
});

describe('rename and colour', () => {
	it('renames, trimming whitespace', () => {
		expect(renameNode(scene(), 'a', '  Base plate ').nodes.a!.name).toBe('Base plate');
	});

	it('ignores blank names', () => {
		const d = scene();
		expect(renameNode(d, 'a', '   ')).toBe(d);
	});

	it('sets the colour on every given node', () => {
		const d = setNodeColor(scene(), ['a', 'b'], '#112233');
		expect(d.nodes.a!.color).toBe('#112233');
		expect(d.nodes.b!.color).toBe('#112233');
		expect(d.nodes.c!.color).not.toBe('#112233');
	});

	it('rejects colours that are not #rrggbb', () => {
		const d = scene();
		expect(setNodeColor(d, ['a'], 'red')).toBe(d);
		expect(setNodeColor(d, ['a'], '#12')).toBe(d);
	});
});

describe('deleteNodes', () => {
	it('removes nodes from the design and the root list', () => {
		const d = deleteNodes(scene(), ['a', 'c']);
		expect(d.roots).toEqual(['b']);
		expect(Object.keys(d.nodes)).toEqual(['b']);
	});

	it('skips locked nodes', () => {
		const d = scene();
		d.nodes.a!.locked = true;
		expect(deleteNodes(d, ['a']).roots).toContain('a');
	});

	it('returns the same design when nothing is deleted', () => {
		const d = scene();
		expect(deleteNodes(d, [])).toBe(d);
		expect(deleteNodes(d, ['nope'])).toBe(d);
	});
});

describe('duplicateNodes', () => {
	it('copies shapes with new ids, offset, and numbered names', () => {
		const { design, ids } = duplicateNodes(scene(), ['a', 'b'], [10, 10]);
		expect(ids).toHaveLength(2);
		expect(design.roots).toHaveLength(5);
		const [boxCopy, cylCopy] = ids.map((id) => design.nodes[id]!);
		expect(boxCopy).toMatchObject({ name: 'Box 2', color: design.nodes.a!.color });
		expect(cylCopy!.name).toBe('Cylinder 2');
		expect(pos(design, ids[0]!)).toEqual([10, 10, 0]);
		expect(pos(design, ids[1]!)).toEqual([60, 40, 0]);
		expect(ids.some((id) => ['a', 'b', 'c'].includes(id))).toBe(false);
	});

	it('keeps sizes and does not share parameter objects with the original', () => {
		const base = setShapeSize(scene(), 'a', { width: 33 });
		const { design, ids } = duplicateNodes(base, ['a'], [0, 0]);
		const copy = design.nodes[ids[0]!]!;
		expect(copy.kind === 'shape' && copy.params.width).toBe(33);
		if (copy.kind === 'shape') copy.params.width = 1;
		expect(base.nodes.a!.kind === 'shape' && base.nodes.a!.params.width).toBe(33);
	});

	it('returns nothing for an empty or unknown selection', () => {
		const d = scene();
		expect(duplicateNodes(d, [], [1, 1])).toEqual({ design: d, ids: [] });
		expect(duplicateNodes(d, ['nope'], [1, 1])).toEqual({ design: d, ids: [] });
	});
});

describe('selection helpers', () => {
	it('replaces the selection on a plain click', () => {
		expect(toggleSelection(['a', 'b'], 'c', false)).toEqual(['c']);
	});

	it('clears the selection when clicking empty space without shift', () => {
		expect(toggleSelection(['a'], null, false)).toEqual([]);
	});

	it('keeps the selection when shift-clicking empty space', () => {
		expect(toggleSelection(['a'], null, true)).toEqual(['a']);
	});

	it('adds and removes with shift', () => {
		expect(toggleSelection(['a'], 'b', true)).toEqual(['a', 'b']);
		expect(toggleSelection(['a', 'b'], 'a', true)).toEqual(['b']);
	});

	it('keeps an already-selected shape selected on a plain click (so a group can be dragged)', () => {
		expect(toggleSelection(['a', 'b'], 'a', false, { keepGroup: true })).toEqual(['a', 'b']);
	});

	it('selectAll picks every visible, unlocked shape in order', () => {
		const d = scene();
		d.nodes.b!.hidden = true;
		d.nodes.c!.locked = true;
		expect(selectAll(d)).toEqual(['a']);
	});

	it('prunes ids that no longer exist', () => {
		expect(pruneSelection(scene(), ['a', 'gone', 'c'])).toEqual(['a', 'c']);
	});
});

describe('nudgeDirections', () => {
	const dirs = (az: number) => nudgeDirections(az);

	it('maps arrows to the world axes closest to the screen directions', () => {
		expect(dirs(0)).toEqual({ right: [1, 0], up: [0, 1] });
		expect(dirs(Math.PI / 2)).toEqual({ right: [0, 1], up: [-1, 0] });
		expect(dirs(Math.PI)).toEqual({ right: [-1, 0], up: [0, -1] });
		expect(dirs(-Math.PI / 2)).toEqual({ right: [0, -1], up: [1, 0] });
	});

	it('rounds an in-between view to the dominant axis', () => {
		expect(dirs(-0.6)).toEqual({ right: [1, 0], up: [0, 1] });
	});
});
