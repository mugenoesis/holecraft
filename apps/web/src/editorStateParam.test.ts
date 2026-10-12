import { addShape, canUndo, createEmptyDesign, type ShapeNode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'tube', [0, 0], { id: 'a' }).design);
const wall = (s: ReturnType<typeof start>) => (s.history.present.nodes.a as ShapeNode).params.wall;

describe('setShapeParam', () => {
	it('sets a setting as one undo step', () => {
		let s = editorReducer(start(), { type: 'setShapeParam', id: 'a', key: 'wall', value: 5 });
		expect(wall(s)).toBe(5);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(wall(s)).toBeUndefined();
	});

	it('records nothing when nothing changes, or the value is not usable', () => {
		const s = editorReducer(start(), { type: 'setShapeParam', id: 'a', key: 'wall', value: 5 });
		expect(editorReducer(s, { type: 'setShapeParam', id: 'a', key: 'wall', value: 5 }).history.past).toHaveLength(1);
		expect(editorReducer(start(), { type: 'setShapeParam', id: 'a', key: 'wall', value: -2 }).history.past).toHaveLength(0);
		expect(editorReducer(start(), { type: 'setShapeParam', id: 'a', key: 'sides', value: 5 }).history.past).toHaveLength(0);
	});
});
