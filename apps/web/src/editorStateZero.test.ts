import { addShape, canUndo, createEmptyDesign } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);

describe('the zero point in the design', () => {
	it('is set by setZero as one undo step, and undone', () => {
		let s = editorReducer(start(), { type: 'setZero', at: [10, 20], turns: 1 });
		expect(s.history.present.zero).toEqual({ x: 10, y: 20, turns: 1 });
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.zero).toBeUndefined();
	});

	it('is cleared by setZero with no place, and a repeat is no step', () => {
		const set = editorReducer(start(), { type: 'setZero', at: [1, 2], turns: 0 });
		expect(editorReducer(set, { type: 'setZero', at: [1, 2], turns: 0 })).toBe(set);
		const cleared = editorReducer(set, { type: 'setZero', at: null, turns: 0 });
		expect(cleared.history.present.zero).toBeUndefined();
		expect(editorReducer(start(), { type: 'setZero', at: null, turns: 0 }).history.present.zero).toBeUndefined();
	});
});
