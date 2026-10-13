import { addShape, canUndo, createEmptyDesign, libraryShapeOf, type WorkPlane } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const saved = () => libraryShapeOf(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design, 'b', 'Plate')!;
const start = () => createEditorState(addShape(createEmptyDesign('t'), 'sphere', [0, 0], { id: 's' }).design);

describe('addLibrary', () => {
	it('adds a copy of the saved shape where asked, selects it, and is one undo step', () => {
		let s = editorReducer(start(), { type: 'addLibrary', shape: saved(), at: [40, 10] });
		const id = s.history.present.roots[1]!;
		expect(s.history.present.nodes[id]).toMatchObject({ name: 'Plate', shapeType: 'box' });
		expect(s.history.present.nodes[id]!.transform.slice(12, 15)).toEqual([40, 10, 0]);
		expect(s.selection).toEqual([id]);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.roots).toEqual(['s']);
	});

	it('puts it on a plane when one is given', () => {
		const wall: WorkPlane = { origin: [0, 0, 10], normal: [1, 0, 0] };
		const s = editorReducer(start(), { type: 'addLibrary', shape: saved(), plane: wall, point: [0, 5, 10] });
		const id = s.history.present.roots[1]!;
		expect(s.history.present.nodes[id]!.transform.slice(8, 11)).toEqual([1, 0, 0]); // standing out of the wall
	});

	it('does nothing for a saved shape that has no single root', () => {
		const s = start();
		expect(editorReducer(s, { type: 'addLibrary', shape: createEmptyDesign('e'), at: [0, 0] })).toBe(s);
	});
});
