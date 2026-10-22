import { addShape, canUndo, createEmptyDesign } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);

describe('the workplane size', () => {
	it('is set by the setWorkplane action, as one undo step', () => {
		let s = editorReducer(start(), { type: 'setWorkplane', width: 400, depth: 300 });
		expect(s.history.present.grid.size).toEqual([400, 300]);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.grid.size).toEqual([200, 200]);
	});

	it('limits a size to between 10 mm and 100 cm', () => {
		const s = editorReducer(start(), { type: 'setWorkplane', width: 5000, depth: 2 });
		expect(s.history.present.grid.size).toEqual([1000, 10]);
	});

	it('is no step at all for the size it already has, or for something that is not a number', () => {
		const before = start();
		expect(editorReducer(before, { type: 'setWorkplane', width: 200, depth: 200 })).toBe(before);
		expect(editorReducer(before, { type: 'setWorkplane', width: Number.NaN, depth: 200 })).toBe(before);
	});

	it('leaves the shapes, and which are selected, as they are', () => {
		const before = editorReducer(start(), { type: 'selectAll' });
		const after = editorReducer(before, { type: 'setWorkplane', width: 500, depth: 500 });
		expect(after.history.present.roots).toEqual(['a']);
		expect(after.selection).toEqual(['a']);
	});
});
