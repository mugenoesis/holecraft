import { addShape, canUndo, createEmptyDesign, type WorkPlane } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const wall: WorkPlane = { origin: [10, 0, 5], normal: [1, 0, 0] };
const start = (selected: string[] = ['a']) => {
	let s = createEditorState(addShape(createEmptyDesign('d'), 'box', [50, 0], { id: 'a' }).design);
	s = { ...s, selection: selected };
	return s;
};
const z = (s: ReturnType<typeof start>) => s.history.present.nodes.a!.transform.slice(8, 11);

describe('standOnPlane', () => {
	it('stands the one selected object on the plane as one undo step, and keeps it selected', () => {
		let s = editorReducer(start(), { type: 'standOnPlane', plane: wall });
		expect(z(s)).toEqual([1, 0, 0]);
		expect(s.selection).toEqual(['a']);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(z(s)).toEqual([0, 0, 1]);
	});

	it('does nothing with nothing selected, or with more than one thing', () => {
		for (const selected of [[], ['a', 'b']]) {
			const s = start(selected);
			expect(editorReducer(s, { type: 'standOnPlane', plane: wall })).toBe(s);
		}
	});

	it('records nothing when it is already there', () => {
		const once = editorReducer(start(), { type: 'standOnPlane', plane: wall });
		expect(editorReducer(once, { type: 'standOnPlane', plane: wall }).history.past).toHaveLength(1);
	});
});
