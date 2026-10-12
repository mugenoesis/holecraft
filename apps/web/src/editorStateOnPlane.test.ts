import { addShape, canUndo, createEmptyDesign, shapeBounds } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);
const TOP = { origin: [0, 0, 20] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };

describe('addOnPlane', () => {
	it('adds a shape standing on the plane, as one undo step, leaving the selection alone', () => {
		let s = editorReducer(start(), { type: 'addOnPlane', shape: 'cylinder', plane: TOP, point: [3, 4, 20] });
		expect(s.history.present.roots).toHaveLength(2);
		const id = s.history.present.roots[1]!;
		expect(s.selection).toEqual([]);
		const node = s.history.present.nodes[id]!;
		expect(node.kind === 'shape' && shapeBounds(node).min[2]).toBeCloseTo(20);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.roots).toHaveLength(1);
	});

	it('does nothing on an underside', () => {
		const s = editorReducer(start(), {
			type: 'addOnPlane',
			shape: 'box',
			plane: { origin: [0, 0, 5], normal: [0, 0, -1] },
			point: [0, 0, 5],
		});
		expect(s.history.present.roots).toHaveLength(1);
		expect(s.history.past).toHaveLength(0);
	});
});
