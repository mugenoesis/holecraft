import { createEmptyDesign } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { canUndoState, createEditorState, editorReducer } from './editorState.ts';

const fresh = () => createEditorState(createEmptyDesign('d', 'Untitled design'));

describe('renameDesign', () => {
	it('renames the design as an undoable step', () => {
		let s = editorReducer(fresh(), { type: 'renameDesign', name: '  Bracket ' });
		expect(s.history.present.name).toBe('Bracket');
		expect(canUndoState(s)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.name).toBe('Untitled design');
	});

	it('ignores a blank or unchanged name', () => {
		const s = fresh();
		expect(editorReducer(s, { type: 'renameDesign', name: '   ' })).toBe(s);
		expect(editorReducer(s, { type: 'renameDesign', name: 'Untitled design' })).toBe(s);
	});

	it('keeps the selection', () => {
		let s = fresh();
		s = editorReducer(s, { type: 'add', shape: 'box', at: [0, 0] });
		const id = s.history.present.roots[0]!;
		s = editorReducer(s, { type: 'pick', id, additive: false, phase: 'down' });
		expect(editorReducer(s, { type: 'renameDesign', name: 'Other' }).selection).toEqual([id]);
	});
});
