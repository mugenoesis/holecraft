import { canUndo, createEmptyDesign, rectangleOutline, type ShapeNode, type WorkPlane } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const FLOOR: WorkPlane = { origin: [0, 0, 0], normal: [0, 0, 1] };
const start = () => createEditorState(createEmptyDesign('d'));
const slab = [rectangleOutline([10, 0], [30, 20])];
const sketchOf = (s: ReturnType<typeof start>) =>
	Object.values(s.history.present.nodes).find((n) => n.kind === 'shape' && n.shapeType === 'sketch') as ShapeNode;

describe('sketch actions', () => {
	it('addSketch makes a Sketch shape on the plane, selects it, and is one undo step', () => {
		let s = editorReducer(start(), { type: 'addSketch', plane: FLOOR, outlines: slab, height: 8 });
		const node = sketchOf(s);
		expect(node.params).toMatchObject({ width: 20, depth: 20, height: 8 });
		expect(s.selection).toEqual([node.id]);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(Object.keys(s.history.present.nodes)).toHaveLength(0);
	});

	it('addSketch records nothing for a drawing with nothing in it, or an underside', () => {
		expect(editorReducer(start(), { type: 'addSketch', plane: FLOOR, outlines: [], height: 8 }).history.past).toHaveLength(0);
		const under: WorkPlane = { origin: [0, 0, 0], normal: [0, 0, -1] };
		expect(editorReducer(start(), { type: 'addSketch', plane: under, outlines: slab, height: 8 }).history.past).toHaveLength(0);
	});

	it('setSketch redraws a sketch shape as one undo step, keeping it selected as it was', () => {
		let s = editorReducer(start(), { type: 'addSketch', plane: FLOOR, outlines: slab, height: 8 });
		const id = sketchOf(s).id;
		s = editorReducer(s, {
			type: 'setSketch',
			id,
			outlines: [rectangleOutline([-10, -10], [10, 10]), rectangleOutline([-3, -3], [3, 3])],
			height: 12,
		});
		expect(sketchOf(s).sketch!.outlines).toHaveLength(2);
		expect(sketchOf(s).params.height).toBe(12);
		expect(s.history.past).toHaveLength(2);
		s = editorReducer(s, { type: 'undo' });
		expect(sketchOf(s).sketch!.outlines).toHaveLength(1);
		expect(sketchOf(s).params.height).toBe(8);
	});

	it('setSketch records nothing when the drawing is the same, the shape is locked, or it is not a sketch', () => {
		let s = editorReducer(start(), { type: 'addSketch', plane: FLOOR, outlines: slab, height: 8 });
		const id = sketchOf(s).id;
		const same = editorReducer(s, { type: 'setSketch', id, outlines: sketchOf(s).sketch!.outlines, height: 8 });
		expect(same.history.past).toHaveLength(1);
		s = editorReducer(s, { type: 'setLocked', ids: [id], locked: true });
		expect(editorReducer(s, { type: 'setSketch', id, outlines: slab, height: 3 }).history.past).toHaveLength(2); // only the lock itself
	});
});
