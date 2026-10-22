import { addShape, canUndo, createEmptyDesign, type ShapeNode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'tube', [0, 0], { id: 'a' }).design);
const wall = (s: ReturnType<typeof start>) => (s.history.present.nodes.a as ShapeNode).params.wall;

describe('setShapeParam', () => {
	it('sets a setting as one undo step', () => {
		let s = editorReducer(start(), { type: 'setShapeParam', id: 'a', key: 'wall', value: 5 });
		expect(wall(s)).toBeCloseTo(0.5, 9); // kept as a share of the shape: 5 mm of the 10 mm radius
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

describe('setShapeText', () => {
	const text = () => createEditorState(addShape(createEmptyDesign('d'), 'text', [0, 0], { id: 'a' }).design);
	const words = (s: ReturnType<typeof text>) => (s.history.present.nodes.a as ShapeNode).params.text;

	it('changes the words as one undo step', () => {
		let s = editorReducer(text(), { type: 'setShapeText', id: 'a', text: 'Holecraft' });
		expect(words(s)).toBe('Holecraft');
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(words(s)).toBe('Text');
	});

	it('records nothing for the same words, blank words, or a shape that is not text', () => {
		expect(editorReducer(text(), { type: 'setShapeText', id: 'a', text: 'Text' }).history.past).toHaveLength(0);
		expect(editorReducer(text(), { type: 'setShapeText', id: 'a', text: '   ' }).history.past).toHaveLength(0);
		expect(editorReducer(start(), { type: 'setShapeText', id: 'a', text: 'Hi' }).history.past).toHaveLength(0);
	});
});

describe('setTextWrap', () => {
	const text = () => createEditorState(addShape(createEmptyDesign('d'), 'text', [0, 0], { id: 'a' }).design);
	const wrap = (s: ReturnType<typeof text>) => (s.history.present.nodes.a as ShapeNode).params.wrap;

	it('wraps the text round a cylinder as one undo step, and undo makes it flat again', () => {
		let s = editorReducer(text(), { type: 'setTextWrap', id: 'a', radius: 30 });
		expect(wrap(s)).toBe(30);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(wrap(s)).toBeUndefined();
	});

	it('records nothing for the same radius, one that is not a number, or a shape that is not text', () => {
		const s = editorReducer(text(), { type: 'setTextWrap', id: 'a', radius: 30 });
		expect(editorReducer(s, { type: 'setTextWrap', id: 'a', radius: 30 }).history.past).toHaveLength(1);
		expect(editorReducer(text(), { type: 'setTextWrap', id: 'a', radius: Number.NaN }).history.past).toHaveLength(0);
		expect(editorReducer(start(), { type: 'setTextWrap', id: 'a', radius: 30 }).history.past).toHaveLength(0);
	});
});
