import { addShape, createEmptyDesign, type Design, groupNodes, setShapeParam } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, type EditorState, editorReducer } from './editorState.ts';

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state);
const design = (s: EditorState) => s.history.present;

/** A threaded rod and a box, grouped as `g` and selected. */
function rodGroup(): EditorState {
	let d: Design = createEmptyDesign('d');
	d = addShape(d, 'threaded-rod', [0, 0], { id: 'rod' }).design;
	d = setShapeParam(d, 'rod', 'size', 8);
	d = addShape(d, 'box', [60, 0], { id: 'x' }).design;
	d = groupNodes(d, ['rod', 'x'], { id: 'g' }).design;
	return { ...createEditorState(d), selection: ['g'] };
}

const widthOf = (s: EditorState) => {
	const b = design(s).nodes.g as { scale?: number[] };
	return b.scale?.[0] ?? 1;
};

describe('unlocking the stretch of a group that holds a fastener', () => {
	it('starts locked for every group', () => {
		expect(createEditorState(createEmptyDesign('d')).unlockedStretch).toEqual([]);
	});

	it('is a change of the editor, not of the design: it is not an undo step and does not touch the design', () => {
		const s = rodGroup();
		const unlocked = run(s, { type: 'setStretchUnlocked', id: 'g', unlocked: true });
		expect(unlocked.unlockedStretch).toEqual(['g']);
		expect(unlocked.history).toBe(s.history);
		expect(run(unlocked, { type: 'setStretchUnlocked', id: 'g', unlocked: false }).unlockedStretch).toEqual([]);
		expect(run(unlocked, { type: 'setStretchUnlocked', id: 'g', unlocked: true })).toBe(unlocked); // already unlocked
	});

	it('leaves a typed size alone while locked, and applies it, as one undo step, once unlocked', () => {
		const s = rodGroup();
		expect(run(s, { type: 'setGroupSize', id: 'g', size: { height: 50 } })).toBe(s);
		const out = run(s, { type: 'setStretchUnlocked', id: 'g', unlocked: true }, { type: 'setGroupSize', id: 'g', size: { height: 50 } });
		expect((design(out).nodes.g as { scale?: number[] }).scale).toBeDefined();
		expect(out.history.past).toHaveLength(1);
		expect(run(out, { type: 'undo' }).history.present).toBe(s.history.present);
	});

	it('lets a handle drag stretch it once unlocked, and not before', () => {
		const geo = { x: 25, y: 0, z: 0, width: 120, depth: 20, height: 20 };
		const locked = rodGroup();
		const tryDrag = (s: EditorState) => run(s, { type: 'moveStart' }, { type: 'setGeometry', id: 'g', geometry: geo }, { type: 'moveEnd' });
		expect(widthOf(tryDrag(locked))).toBe(1);
		const unlocked = run(locked, { type: 'setStretchUnlocked', id: 'g', unlocked: true });
		expect(widthOf(tryDrag(unlocked))).toBeGreaterThan(1);
	});

	it('stops stretching again when locked again', () => {
		const unlocked = run(rodGroup(), { type: 'setStretchUnlocked', id: 'g', unlocked: true });
		const relocked = run(unlocked, { type: 'setStretchUnlocked', id: 'g', unlocked: false });
		expect(run(relocked, { type: 'setGroupSize', id: 'g', size: { height: 50 } })).toBe(relocked);
	});
});
