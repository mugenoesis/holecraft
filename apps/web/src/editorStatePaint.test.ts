import { addShape, canUndo, createEmptyDesign, type PaintFill } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);
const fill: PaintFill = { id: 'f1', kind: 'region', color: '#2a9d8f', point: [0, 0, 20], normal: [0, 0, 1] };
const paintOf = (s: ReturnType<typeof start>) => s.history.present.nodes.a!.paint;

describe('paint actions', () => {
	it('addPaint puts a fill on the shape as one undo step, and undo takes it off', () => {
		let s = editorReducer(start(), { type: 'addPaint', id: 'a', fill });
		expect(paintOf(s)).toEqual([fill]);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(paintOf(s)).toBeUndefined();
	});

	it('addPaint records nothing for a shape that is locked, or the same fill again', () => {
		const locked = editorReducer(start(), { type: 'setLocked', ids: ['a'], locked: true });
		expect(editorReducer(locked, { type: 'addPaint', id: 'a', fill }).history.past).toHaveLength(1); // only the lock itself
		const once = editorReducer(start(), { type: 'addPaint', id: 'a', fill });
		expect(editorReducer(once, { type: 'addPaint', id: 'a', fill }).history.past).toHaveLength(1);
	});

	it('clearPaint takes the paint off every shape given as one undo step', () => {
		const two = createEditorState(
			addShape(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, 'cylinder', [50, 0], { id: 'b' }).design,
		);
		const s = editorReducer(editorReducer(two, { type: 'addPaint', id: 'a', fill }), {
			type: 'addPaint',
			id: 'b',
			fill: { ...fill, id: 'f2' },
		});
		const cleared = editorReducer(s, { type: 'clearPaint', ids: ['a', 'b'] });
		expect(cleared.history.present.nodes.a!.paint).toBeUndefined();
		expect(cleared.history.present.nodes.b!.paint).toBeUndefined();
		expect(cleared.history.past).toHaveLength(s.history.past.length + 1);
	});

	it('clearPaint takes all the paint off as one undo step, and does nothing when there is none', () => {
		const painted = editorReducer(start(), { type: 'addPaint', id: 'a', fill });
		const cleared = editorReducer(painted, { type: 'clearPaint', ids: ['a'] });
		expect(paintOf(cleared)).toBeUndefined();
		expect(cleared.history.past).toHaveLength(2);
		expect(editorReducer(start(), { type: 'clearPaint', ids: ['a'] }).history.past).toHaveLength(0);
		expect(paintOf(editorReducer(cleared, { type: 'undo' }))).toEqual([fill]);
	});
});
