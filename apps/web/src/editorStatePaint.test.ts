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

describe('a brush stroke (a drag)', () => {
	const dab = (x: number) => ({ point: [x, 0, 20] as [number, number, number], normal: [0, 0, 1] as [number, number, number] });
	const stroke = (n: number): PaintFill => ({
		id: 's',
		kind: 'brush',
		color: '#2a9d8f',
		shape: 'sphere',
		radius: 3,
		dabs: Array.from({ length: n }, (_, i) => dab(i)),
	});

	it('previews the growing stroke without making history, and one undo step takes the whole stroke back', () => {
		let s = editorReducer(start(), { type: 'paintStart', id: 'a' });
		s = editorReducer(s, { type: 'previewPaint', id: 'a', fill: stroke(1) });
		expect(paintOf(s)).toEqual([stroke(1)]);
		s = editorReducer(s, { type: 'previewPaint', id: 'a', fill: stroke(5) });
		expect(paintOf(s)).toEqual([stroke(5)]); // the same stroke, longer: not a second fill
		expect(s.history.past).toHaveLength(0);
		s = editorReducer(s, { type: 'moveEnd' });
		expect(s.history.past).toHaveLength(1);
		expect(paintOf(editorReducer(s, { type: 'undo' }))).toBeUndefined();
	});

	it('goes on after paint that was already there, and cancelDrag puts everything back as it was', () => {
		const before = editorReducer(start(), { type: 'addPaint', id: 'a', fill });
		let s = editorReducer(before, { type: 'paintStart', id: 'a' });
		s = editorReducer(s, { type: 'previewPaint', id: 'a', fill: stroke(3) });
		expect(paintOf(s)!.map((f) => f.id)).toEqual(['f1', 's']);
		s = editorReducer(s, { type: 'cancelDrag' });
		expect(paintOf(s)).toEqual([fill]);
		expect(s.drag).toBeNull();
	});

	it('ignores a preview for a shape the stroke did not start on, or when no stroke has started', () => {
		const idle = editorReducer(start(), { type: 'previewPaint', id: 'a', fill: stroke(1) });
		expect(paintOf(idle)).toBeUndefined();
		const two = createEditorState(
			addShape(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, 'cylinder', [50, 0], { id: 'b' }).design,
		);
		const started = editorReducer(two, { type: 'paintStart', id: 'a' });
		expect(editorReducer(started, { type: 'previewPaint', id: 'b', fill: stroke(1) }).history.present.nodes.b!.paint).toBeUndefined();
	});

	it('starts nothing for a shape that cannot be painted, or while another drag is going', () => {
		const locked = editorReducer(start(), { type: 'setLocked', ids: ['a'], locked: true });
		expect(editorReducer(locked, { type: 'paintStart', id: 'a' }).drag).toBeNull();
		const moving = editorReducer(editorReducer(start(), { type: 'pick', id: 'a', additive: false, phase: 'down' }), { type: 'moveStart' });
		expect(editorReducer(moving, { type: 'paintStart', id: 'a' })).toBe(moving);
	});
});

describe('addPaintAll (a gap fill over several shapes)', () => {
	const gaps: PaintFill = { id: 'g', kind: 'gaps', color: null, area: 1 };
	const two = () =>
		createEditorState(
			addShape(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, 'cylinder', [50, 0], { id: 'b' }).design,
		);

	it('puts the fill on every shape given as one undo step', () => {
		const s = editorReducer(two(), { type: 'addPaintAll', ids: ['a', 'b'], fill: gaps });
		expect(s.history.present.nodes.a!.paint).toEqual([gaps]);
		expect(s.history.present.nodes.b!.paint).toEqual([gaps]);
		expect(s.history.past).toHaveLength(1);
		const undone = editorReducer(s, { type: 'undo' });
		expect(undone.history.present.nodes.a!.paint).toBeUndefined();
		expect(undone.history.present.nodes.b!.paint).toBeUndefined();
	});

	it('records nothing when no shape can take it', () => {
		const locked = editorReducer(two(), { type: 'setLocked', ids: ['a', 'b'], locked: true });
		expect(editorReducer(locked, { type: 'addPaintAll', ids: ['a', 'b'], fill: gaps }).history.past).toHaveLength(1);
	});
});
