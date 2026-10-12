import { addShape, canUndo, createEmptyDesign, nodeBoundsIn } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const start = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 0], { id: 'b' }).design;
	return createEditorState(d);
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const left = (s: ReturnType<typeof start>, id: string) => nodeBoundsIn(s.history.present, id)!.min[0];

describe('align and flip actions', () => {
	it('align works on the selection, as one undo step', () => {
		let s = run({ type: 'selectAll' }, { type: 'align', axis: 'x', edge: 'min' });
		expect(left(s, 'a')).toBeCloseTo(left(s, 'b'));
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(left(s, 'b')).toBeCloseTo(50);
	});

	it('flip mirrors the selection, as one undo step', () => {
		let s = run({ type: 'selectAll' }, { type: 'flip', axis: 'x' });
		expect(left(s, 'a')).toBeCloseTo(50);
		s = editorReducer(s, { type: 'undo' });
		expect(left(s, 'a')).toBeCloseTo(-10);
	});

	it('does nothing, and records no undo step, without a selection or when nothing would change', () => {
		expect(run({ type: 'align', axis: 'x', edge: 'min' }).history.past).toHaveLength(0);
		expect(run({ type: 'flip', axis: 'x' }).history.past).toHaveLength(0);
		expect(run({ type: 'selectAll' }, { type: 'align', axis: 'z', edge: 'min' }).history.past).toHaveLength(0);
	});

	it('keeps the selection', () => {
		const s = run({ type: 'selectAll' }, { type: 'flip', axis: 'y' });
		expect(s.selection).toEqual(['a', 'b']);
	});
});
