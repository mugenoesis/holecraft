import { addShape, canUndo, createEmptyDesign, translationOf } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const start = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [50, 0], { id: 'b' }).design;
	return createEditorState(d);
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const nodes = (s: ReturnType<typeof start>) => s.history.present.nodes;

describe('hide, lock and show all', () => {
	it('hiding deselects what was hidden, as one undo step', () => {
		let s = run({ type: 'selectAll' }, { type: 'setHidden', ids: ['a'], hidden: true });
		expect(nodes(s).a!.hidden).toBe(true);
		expect(s.selection).toEqual(['b']);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(nodes(s).a!.hidden).toBe(false);
	});

	it('locking keeps the selection but stops moves', () => {
		const s = run({ type: 'selectAll' }, { type: 'setLocked', ids: ['a'], locked: true }, { type: 'nudge', delta: [5, 0] });
		expect(s.selection).toEqual(['a', 'b']);
		expect(translationOf(nodes(s).a!.transform)).toEqual([0, 0, 0]);
		expect(translationOf(nodes(s).b!.transform)).toEqual([55, 0, 0]);
	});

	it('Show all reveals everything in one step, and does nothing when nothing is hidden', () => {
		let s = run({ type: 'setHidden', ids: ['a', 'b'], hidden: true }, { type: 'showAll' });
		expect([nodes(s).a!.hidden, nodes(s).b!.hidden]).toEqual([false, false]);
		s = editorReducer(s, { type: 'undo' });
		expect(nodes(s).a!.hidden).toBe(true);
		expect(run({ type: 'showAll' }).history.past).toHaveLength(0);
	});
});
