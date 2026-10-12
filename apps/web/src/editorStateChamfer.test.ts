import { addShape, canUndo, createEmptyDesign } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);
const params = (s: ReturnType<typeof start>) => {
	const node = s.history.present.nodes.a!;
	return node.kind === 'shape' ? node.params : {};
};

describe('setChamfer', () => {
	it('sets a chamfer as one undo step', () => {
		let s = editorReducer(start(), { type: 'setChamfer', id: 'a', size: 2 });
		expect(params(s).chamfer).toBe(2);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(params(s).chamfer).toBeUndefined();
	});

	it('changes the edges', () => {
		let s = editorReducer(start(), { type: 'setChamfer', id: 'a', size: 2 });
		s = editorReducer(s, { type: 'setChamfer', id: 'a', edges: 'bottom' });
		expect(params(s)).toMatchObject({ chamfer: 2, chamferEdges: 'bottom' });
	});

	it('records nothing when nothing changes', () => {
		expect(editorReducer(start(), { type: 'setChamfer', id: 'a', size: 0 }).history.past).toHaveLength(0);
	});
});
