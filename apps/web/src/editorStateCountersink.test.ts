import { addShape, canUndo, createEmptyDesign, setNodeMode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(setNodeMode(addShape(createEmptyDesign('d'), 'cylinder', [0, 0], { id: 'a' }).design, ['a'], 'hole'));
const params = (s: ReturnType<typeof start>) => {
	const node = s.history.present.nodes.a!;
	return node.kind === 'shape' ? node.params : {};
};

describe('setCountersink', () => {
	it('sets a countersink as one undo step', () => {
		let s = editorReducer(start(), { type: 'setCountersink', id: 'a', size: 3 });
		expect(params(s).countersink).toBe(3);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(params(s).countersink).toBeUndefined();
	});

	it('changes the end', () => {
		let s = editorReducer(start(), { type: 'setCountersink', id: 'a', size: 3 });
		s = editorReducer(s, { type: 'setCountersink', id: 'a', end: 'both' });
		expect(params(s)).toMatchObject({ countersink: 3, countersinkEnd: 'both' });
	});

	it('records nothing when nothing changes', () => {
		expect(editorReducer(start(), { type: 'setCountersink', id: 'a', size: 0 }).history.past).toHaveLength(0);
	});
});
