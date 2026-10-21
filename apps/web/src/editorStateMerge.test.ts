import { addShape, canUndo, createEmptyDesign, type ShapeNode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const REF = 'c'.repeat(64);
const input = { name: 'Merged', ref: REF, size: [35, 20, 20] as [number, number, number] };

const start = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [15, 0], { id: 'b' }).design;
	d = addShape(d, 'box', [80, 0], { id: 'c' }).design;
	return createEditorState(d);
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());

describe('mergeToMesh', () => {
	it('replaces the shapes by one mesh shape and selects it, as one undo step', () => {
		const before = start();
		let s = run({ type: 'mergeToMesh', ids: ['a', 'b'], input });
		const design = s.history.present;
		expect(design.roots).toHaveLength(2);
		expect(design.roots).toContain('c');
		const merged = design.nodes[s.selection[0]!] as ShapeNode;
		expect(merged.params.mesh).toBe(REF);
		expect(merged.name).toBe('Merged');
		expect(s.selection).toHaveLength(1);
		expect(design.nodes.a).toBeUndefined();
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.roots).toEqual(before.history.present.roots);
		expect(s.history.present.nodes.a).toBeDefined();
		expect(s.history.present.nodes.b).toBeDefined();
	});

	it('leaves everything alone when the selection cannot be merged', () => {
		const s = start();
		expect(editorReducer(s, { type: 'mergeToMesh', ids: ['a'], input })).toBe(s);
		expect(editorReducer(s, { type: 'mergeToMesh', ids: [], input })).toBe(s);
	});
});
