import { addShape, canUndo, createEmptyDesign, type EdgeTreatment } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

const T = (id: string, size = 2): EdgeTreatment => ({
	id,
	kind: 'chamfer',
	size,
	points: [
		[-10, -10, 20],
		[10, -10, 20],
	],
	normals: [
		[
			[0, 0, 1],
			[0, -1, 0],
		],
	],
});
const start = () => {
	const s = createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);
	return { ...s, selection: ['a'] };
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const edges = (s: ReturnType<typeof start>) => s.history.present.nodes.a!.edges;

describe('edge treatment actions', () => {
	it('previews while the tool is open, and Apply makes it one undo step', () => {
		let s = run(
			{ type: 'moveStart' },
			{ type: 'previewEdges', id: 'a', edges: [T('e1')] },
			{ type: 'previewEdges', id: 'a', edges: [T('e1', 3)] },
		);
		expect(edges(s)![0]!.size).toBe(3);
		expect(canUndo(s.history)).toBe(false); // nothing recorded yet
		s = editorReducer(s, { type: 'moveEnd' });
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(edges(s)).toBeUndefined();
	});

	it('Cancel puts the design back as it was, with nothing to undo', () => {
		const s = run({ type: 'moveStart' }, { type: 'previewEdges', id: 'a', edges: [T('e1')] }, { type: 'cancelDrag' });
		expect(edges(s)).toBeUndefined();
		expect(s.drag).toBeNull();
		expect(canUndo(s.history)).toBe(false);
	});

	it('ignores a preview for something that is not being edited', () => {
		expect(edges(run({ type: 'previewEdges', id: 'a', edges: [T('e1')] }))).toBeUndefined();
	});

	it('removes treatments as one undo step (the notice’s Remove button)', () => {
		let s = run({ type: 'moveStart' }, { type: 'previewEdges', id: 'a', edges: [T('e1'), T('e2')] }, { type: 'moveEnd' });
		s = editorReducer(s, { type: 'removeEdges', id: 'a', ids: ['e1'] });
		expect(edges(s)!.map((t) => t.id)).toEqual(['e2']);
		s = editorReducer(s, { type: 'undo' });
		expect(edges(s)).toHaveLength(2);
	});
});
