import { addShape, createEmptyDesign, translationOf } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);
const run = (s: ReturnType<typeof start>, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);
const select = (id: string): EditorAction => ({ type: 'marquee', ids: [id], additive: false });
const at = (s: ReturnType<typeof start>, id: string) => translationOf(s.history.present.nodes[id]!.transform);

describe('duplicate and repeat', () => {
	it('Ctrl+D after moving the copy makes another copy the same step further on', () => {
		let s = run(start(), select('a'), { type: 'duplicate' });
		const copy = s.selection[0]!;
		s = run(s, { type: 'nudge', delta: [20, 0] }); // copy goes from (10,10) to (30,10), a step of (30,10) from the original
		s = run(s, { type: 'duplicate' });
		expect(s.selection).toHaveLength(1);
		expect(at(s, s.selection[0]!)).toEqual([60, 20, 0]);
		s = run(s, { type: 'duplicate' });
		expect(at(s, s.selection[0]!)).toEqual([90, 30, 0]);
		expect(Object.keys(s.history.present.nodes)).toHaveLength(4);
		expect(copy).not.toBe(s.selection[0]);
	});

	it('is one undo step per copy', () => {
		let s = run(start(), select('a'), { type: 'duplicate' }, { type: 'nudge', delta: [20, 0] }, { type: 'duplicate' });
		s = run(s, { type: 'undo' });
		expect(Object.keys(s.history.present.nodes)).toHaveLength(2);
	});

	it('starts over (the plain offset) when something else is selected', () => {
		let s = run(start(), select('a'), { type: 'duplicate' }, { type: 'nudge', delta: [20, 0] });
		s = run(s, select('a'), { type: 'duplicate' });
		expect(at(s, s.selection[0]!)).toEqual([10, 10, 0]);
	});
});
