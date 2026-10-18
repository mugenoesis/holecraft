import { addShape, canUndo, createEmptyDesign, supportsStale } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const start = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	return createEditorState(d);
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const points = (s: ReturnType<typeof start>) => s.history.present.supports?.points ?? [];

const DOC = {
	objects: [
		{
			points: [
				{ x: 1, y: 2, z: 0, radius: 0.4, type: 'island' as const },
				{ x: 3, y: 4, z: 0, radius: 0.5, type: 'slope' as const },
			],
		},
	],
};

describe('support point actions', () => {
	it('takes the points the slicer made, as one undo step', () => {
		let s = run({ type: 'supportsMade', doc: DOC });
		expect(points(s)).toHaveLength(2);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(points(s)).toHaveLength(0);
	});

	it('adds a point of your own, as one undo step', () => {
		let s = run({ type: 'supportsMade', doc: DOC }, { type: 'supportAdd', point: { object: 0, x: 5, y: 5, z: 20, radius: 0.6 } });
		expect(points(s)).toHaveLength(3);
		expect(points(s)[2]).toMatchObject({ x: 5, y: 5, z: 20, radius: 0.6, type: 'manual' });
		s = editorReducer(s, { type: 'undo' });
		expect(points(s)).toHaveLength(2);
	});

	it('removes a point and the width of one can be changed', () => {
		const made = run({ type: 'supportsMade', doc: DOC });
		const id = points(made)[0]!.id;
		expect(points(editorReducer(made, { type: 'supportRemove', id }))).toHaveLength(1);
		expect(points(editorReducer(made, { type: 'supportRadius', id, radius: 0.9 }))[0]!.radius).toBe(0.9);
	});

	it('takes every point away', () => {
		const s = run({ type: 'supportsMade', doc: DOC }, { type: 'supportsClear' });
		expect(s.history.present.supports).toBeUndefined();
	});

	it('moves a point as a drag: a live preview that is one undo step when it ends, or goes back when cancelled', () => {
		const made = run({ type: 'supportsMade', doc: DOC });
		const id = points(made)[0]!.id;
		let s = editorReducer(made, { type: 'supportDragStart' });
		s = editorReducer(s, { type: 'supportMove', id, to: [7, 8, 9] });
		s = editorReducer(s, { type: 'supportMove', id, to: [10, 11, 12] });
		expect(points(s)[0]).toMatchObject({ x: 10, y: 11, z: 12 });
		const ended = editorReducer(s, { type: 'moveEnd' });
		expect(points(ended)[0]).toMatchObject({ x: 10, y: 11, z: 12 });
		expect(points(editorReducer(ended, { type: 'undo' }))[0]).toMatchObject({ x: 1, y: 2, z: 0 });

		const cancelled = editorReducer(s, { type: 'cancelDrag' });
		expect(points(cancelled)[0]).toMatchObject({ x: 1, y: 2, z: 0 });
	});

	it('does nothing for a drag with no points, or a move outside one', () => {
		const s = start();
		expect(editorReducer(s, { type: 'supportDragStart' })).toBe(s);
		const made = run({ type: 'supportsMade', doc: DOC });
		expect(editorReducer(made, { type: 'supportMove', id: 'x', to: [1, 1, 1] })).toBe(made);
	});

	it('shows points as out of date once a shape is moved', () => {
		let s = run({ type: 'supportsMade', doc: DOC });
		expect(supportsStale(s.history.present)).toBe(false);
		s = editorReducer(s, { type: 'pick', id: 'a', additive: false, phase: 'down' });
		s = editorReducer(s, { type: 'moveStart' });
		s = editorReducer(s, { type: 'move', delta: [5, 0] });
		s = editorReducer(s, { type: 'moveEnd' });
		expect(supportsStale(s.history.present)).toBe(true);
	});
});
