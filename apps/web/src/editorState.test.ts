import { addShape, canRedo, canUndo, createEmptyDesign, type Design, translationOf } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, type EditorState, editorReducer } from './editorState.ts';

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
	return actions.reduce(editorReducer, state);
}

/** Two shapes with fixed ids, 'a' at the origin and 'b' at (50, 0). */
function withTwo(): EditorState {
	let d: Design = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	return createEditorState(d);
}

const design = (s: EditorState) => s.history.present;
const pos = (s: EditorState, id: string) => translationOf(design(s).nodes[id]!.transform);

describe('createEditorState', () => {
	it('starts with the given design, nothing selected and no history', () => {
		const s = createEditorState(createEmptyDesign('d'));
		expect(s.selection).toEqual([]);
		expect(canUndo(s.history)).toBe(false);
	});
});

describe('add', () => {
	it('adds a shape as an undoable step without changing the selection', () => {
		const s = run(withTwo(), { type: 'pick', id: 'a', additive: false, phase: 'down' }, { type: 'add', shape: 'cylinder', at: [10, 20] });
		expect(design(s).roots).toHaveLength(3);
		expect(s.selection).toEqual(['a']);
		expect(canUndo(s.history)).toBe(true);
	});
});

describe('selection', () => {
	it('pointer-down on an unselected shape selects it alone', () => {
		const s = run(withTwo(), { type: 'pick', id: 'a', additive: false, phase: 'down' });
		expect(s.selection).toEqual(['a']);
		expect(run(s, { type: 'pick', id: 'b', additive: false, phase: 'down' }).selection).toEqual(['b']);
	});

	it('shift toggles membership', () => {
		let s = run(
			withTwo(),
			{ type: 'pick', id: 'a', additive: false, phase: 'down' },
			{ type: 'pick', id: 'b', additive: true, phase: 'down' },
		);
		expect(s.selection).toEqual(['a', 'b']);
		s = run(s, { type: 'pick', id: 'a', additive: true, phase: 'down' });
		expect(s.selection).toEqual(['b']);
	});

	it('pointer-down on a member of a multi-selection keeps the group, so it can be dragged', () => {
		const s = run(withTwo(), { type: 'selectAll' }, { type: 'pick', id: 'a', additive: false, phase: 'down' });
		expect(s.selection).toEqual(['a', 'b']);
	});

	it('a click without dragging then narrows the group to the clicked shape', () => {
		const s = run(withTwo(), { type: 'selectAll' }, { type: 'pick', id: 'a', additive: false, phase: 'click' });
		expect(s.selection).toEqual(['a']);
	});

	it('a shift-click release changes nothing further', () => {
		const before = run(withTwo(), { type: 'selectAll' });
		expect(run(before, { type: 'pick', id: 'a', additive: true, phase: 'click' })).toBe(before);
	});

	it('clicking empty space clears the selection, but not with shift', () => {
		const s = run(withTwo(), { type: 'selectAll' });
		expect(run(s, { type: 'pick', id: null, additive: false, phase: 'down' }).selection).toEqual([]);
		expect(run(s, { type: 'pick', id: null, additive: true, phase: 'down' }).selection).toEqual(['a', 'b']);
	});

	it('a marquee replaces the selection, or adds to it with shift', () => {
		const s = run(withTwo(), { type: 'pick', id: 'a', additive: false, phase: 'down' });
		expect(run(s, { type: 'marquee', ids: ['b'], additive: false }).selection).toEqual(['b']);
		expect(run(s, { type: 'marquee', ids: ['a', 'b'], additive: true }).selection).toEqual(['a', 'b']);
	});

	it('selectAll and clearSelection', () => {
		const s = run(withTwo(), { type: 'selectAll' });
		expect(s.selection).toEqual(['a', 'b']);
		expect(run(s, { type: 'clearSelection' }).selection).toEqual([]);
	});

	it('selection changes never touch the undo history', () => {
		const s = run(withTwo(), { type: 'selectAll' }, { type: 'clearSelection' });
		expect(canUndo(s.history)).toBe(false);
		expect(design(s).roots).toEqual(['a', 'b']);
	});
});

describe('drag-moving', () => {
	const selectA = (s: EditorState) => run(s, { type: 'pick', id: 'a', additive: false, phase: 'down' });

	it('previews live and commits the whole drag as one undo step', () => {
		let s = selectA(withTwo());
		s = run(s, { type: 'moveStart' }, { type: 'move', delta: [5, 0] }, { type: 'move', delta: [12, 7] }, { type: 'moveEnd' });
		expect(pos(s, 'a')).toEqual([12, 7, 0]);
		expect(s.history.past).toHaveLength(1);

		s = run(s, { type: 'undo' });
		expect(pos(s, 'a')).toEqual([0, 0, 0]);
		expect(canUndo(s.history)).toBe(false);
	});

	it('shows the preview without recording history until the drag ends', () => {
		const s = run(selectA(withTwo()), { type: 'moveStart' }, { type: 'move', delta: [20, 0] });
		expect(pos(s, 'a')).toEqual([20, 0, 0]);
		expect(canUndo(s.history)).toBe(false);
	});

	it('snaps to the grid and carries the whole selection', () => {
		let s = run(withTwo(), { type: 'selectAll' });
		s = run(s, { type: 'moveStart' }, { type: 'move', delta: [3.4, -2.6] }, { type: 'moveEnd' });
		expect(pos(s, 'a')).toEqual([3, -3, 0]);
		expect(pos(s, 'b')).toEqual([53, -3, 0]);
	});

	it('ends without an undo step if the shape came back to where it started', () => {
		const s = run(
			selectA(withTwo()),
			{ type: 'moveStart' },
			{ type: 'move', delta: [9, 9] },
			{ type: 'move', delta: [0, 0] },
			{ type: 'moveEnd' },
		);
		expect(canUndo(s.history)).toBe(false);
	});

	it('ignores moves that were never started', () => {
		const before = selectA(withTwo());
		expect(run(before, { type: 'move', delta: [5, 5] })).toBe(before);
		expect(run(before, { type: 'moveEnd' })).toBe(before);
	});

	it('ignores undo and redo while a drag is in progress', () => {
		const s = run(selectA(withTwo()), { type: 'add', shape: 'box', at: [0, 0] });
		const dragging = run(s, { type: 'moveStart' }, { type: 'move', delta: [4, 0] });
		expect(run(dragging, { type: 'undo' })).toBe(dragging);
		expect(run(dragging, { type: 'redo' })).toBe(dragging);
	});
});

describe('undo and redo', () => {
	it('walks back and forward through edits', () => {
		let s = withTwo();
		s = run(s, { type: 'add', shape: 'box', at: [0, 0] }, { type: 'add', shape: 'sphere', at: [0, 0] });
		expect(design(s).roots).toHaveLength(4);
		s = run(s, { type: 'undo' }, { type: 'undo' });
		expect(design(s).roots).toHaveLength(2);
		expect(canRedo(s.history)).toBe(true);
		s = run(s, { type: 'redo' });
		expect(design(s).roots).toHaveLength(3);
	});

	it('drops selected ids that no longer exist', () => {
		const s0 = run(withTwo(), { type: 'add', shape: 'box', at: [0, 0] });
		const newId = design(s0).roots[2]!;
		const s1 = run(s0, { type: 'pick', id: newId, additive: false, phase: 'down' });
		expect(s1.selection).toEqual([newId]);
		expect(run(s1, { type: 'undo' }).selection).toEqual([]);
	});

	it('does nothing with nothing to undo or redo', () => {
		const s = withTwo();
		expect(run(s, { type: 'undo' })).toBe(s);
		expect(run(s, { type: 'redo' })).toBe(s);
	});
});

describe('delete, duplicate and nudge', () => {
	it('deletes the selection as one undoable step', () => {
		const s = run(withTwo(), { type: 'selectAll' }, { type: 'delete' });
		expect(design(s).roots).toEqual([]);
		expect(s.selection).toEqual([]);
		expect(design(run(s, { type: 'undo' })).roots).toEqual(['a', 'b']);
	});

	it('delete and duplicate with nothing selected are no-ops', () => {
		const s = withTwo();
		expect(run(s, { type: 'delete' })).toBe(s);
		expect(run(s, { type: 'duplicate' })).toBe(s);
	});

	it('duplicates the selection, offset, and selects the copies', () => {
		const s = run(withTwo(), { type: 'pick', id: 'a', additive: false, phase: 'down' }, { type: 'duplicate' });
		expect(design(s).roots).toHaveLength(3);
		expect(s.selection).toHaveLength(1);
		expect(s.selection[0]).not.toBe('a');
		const [x, y] = pos(s, s.selection[0]!);
		expect([x, y]).not.toEqual([0, 0]);
	});

	it('nudges the selection as one step per press', () => {
		let s = run(withTwo(), { type: 'selectAll' });
		s = run(s, { type: 'nudge', delta: [1, 0] }, { type: 'nudge', delta: [0, 10] });
		expect(pos(s, 'a')).toEqual([1, 10, 0]);
		expect(pos(s, 'b')).toEqual([51, 10, 0]);
		expect(s.history.past).toHaveLength(2);
	});

	it('nudging with nothing selected is a no-op', () => {
		const s = withTwo();
		expect(run(s, { type: 'nudge', delta: [1, 0] })).toBe(s);
	});
});

describe('property edits', () => {
	it('records position, size, name and colour changes as separate undoable steps', () => {
		let s = withTwo();
		s = run(s, { type: 'setPosition', id: 'a', at: [7, 8] });
		s = run(s, { type: 'setSize', id: 'a', size: { width: 33 } });
		s = run(s, { type: 'rename', id: 'a', name: 'Plate' });
		s = run(s, { type: 'setColor', ids: ['a', 'b'], color: '#abcdef' });
		expect(pos(s, 'a')).toEqual([7, 8, 0]);
		expect(design(s).nodes.a).toMatchObject({ name: 'Plate', color: '#abcdef', params: { width: 33 } });
		expect(s.history.past).toHaveLength(4);
	});

	it('ignores invalid edits without recording a step', () => {
		const s = withTwo();
		expect(run(s, { type: 'setSize', id: 'a', size: { width: -1 } })).toBe(s);
		expect(run(s, { type: 'setPosition', id: 'a', at: [Number.NaN, 0] })).toBe(s);
		expect(run(s, { type: 'rename', id: 'a', name: '  ' })).toBe(s);
		expect(run(s, { type: 'setColor', ids: ['a'], color: 'red' })).toBe(s);
	});
});

describe('resinHole', () => {
	const picked = () => run(withTwo(), { type: 'pick', id: 'a', additive: false, phase: 'down' });

	it('adds a drain hole to the selected shape as one undoable step and selects the group it makes', () => {
		const s = run(picked(), { type: 'resinHole', kind: 'drain', diameter: 3.5 });
		const [groupId] = s.selection;
		expect(s.selection).toHaveLength(1);
		const group = design(s).nodes[groupId!]!;
		expect(group.kind).toBe('group');
		expect(group.kind === 'group' && group.children).toHaveLength(2);
		expect(canUndo(s.history)).toBe(true);
		const undone = run(s, { type: 'undo' });
		expect(design(undone).roots).toEqual(['a', 'b']);
	});

	it('adds the vent hole to that group, in a second step', () => {
		const s = run(picked(), { type: 'resinHole', kind: 'drain', diameter: 3.5 }, { type: 'resinHole', kind: 'vent', diameter: 3.5 });
		const group = design(s).nodes[s.selection[0]!]!;
		expect(group.kind === 'group' && group.children).toHaveLength(3);
		expect(design(run(s, { type: 'undo' })).nodes[s.selection[0]!]).toMatchObject({ children: expect.arrayContaining(['a']) });
	});

	it('does nothing when two shapes are selected', () => {
		const s = run(picked(), { type: 'pick', id: 'b', additive: true, phase: 'down' });
		expect(run(s, { type: 'resinHole', kind: 'drain', diameter: 3.5 })).toBe(s);
	});
});

describe('tilt', () => {
	const picked = () => run(withTwo(), { type: 'pick', id: 'a', additive: false, phase: 'down' });

	it('tilts the selected shape as one undoable step and keeps it selected', () => {
		const s = run(picked(), { type: 'tilt', degrees: 30 });
		expect(s.selection).toEqual(['a']);
		expect(design(s).nodes.a!.transform).not.toEqual(design(picked()).nodes.a!.transform);
		expect(design(run(s, { type: 'undo' })).nodes.a!.transform).toEqual(design(picked()).nodes.a!.transform);
	});

	it('does nothing with two shapes selected', () => {
		const s = run(picked(), { type: 'pick', id: 'b', additive: true, phase: 'down' });
		expect(run(s, { type: 'tilt', degrees: 30 })).toBe(s);
	});
});
