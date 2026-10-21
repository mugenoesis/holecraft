import { addMeshShape, canUndo, createEmptyDesign, type ShapeNode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);

const start = () =>
	createEditorState(addMeshShape(createEmptyDesign('d'), { name: 'Part', ref: OLD, size: [10, 20, 30] }, { id: 'm' }).design);
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const ref = (s: ReturnType<typeof start>) => (s.history.present.nodes.m as ShapeNode).params.mesh;

describe('setMeshRef', () => {
	it('points an imported model at the repaired mesh, as one undo step', () => {
		let s = run({ type: 'setMeshRef', id: 'm', ref: NEW });
		expect(ref(s)).toBe(NEW);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(ref(s)).toBe(OLD);
	});

	it('does nothing for the same mesh or a name that is not one', () => {
		const s = start();
		expect(editorReducer(s, { type: 'setMeshRef', id: 'm', ref: OLD })).toBe(s);
		expect(editorReducer(s, { type: 'setMeshRef', id: 'm', ref: 'x' })).toBe(s);
	});
});
