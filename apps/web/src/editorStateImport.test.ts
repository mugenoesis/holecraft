import { canUndo, createEmptyDesign, type MeshPlacement, shapeBounds } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const input = (name = 'Bracket', size: [number, number, number] = [10, 20, 30]) => ({ name, ref: 'a'.repeat(64), size });
const one = (at: [number, number] = [0, 0], lift = 0): MeshPlacement[] => [{ input: input(), at, lift }];
const start = () => createEditorState(createEmptyDesign('d'));

describe('adding imported models', () => {
	it('adds a model to the design and selects it', () => {
		const s = editorReducer(start(), { type: 'addMeshes', items: one() });
		const id = s.history.present.roots[0]!;
		expect(s.history.present.nodes[id]).toMatchObject({ name: 'Bracket', shapeType: 'mesh' });
		expect(s.selection).toEqual([id]);
	});

	it('is one undo step', () => {
		let s = editorReducer(start(), { type: 'addMeshes', items: one() });
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.roots).toEqual([]);
	});

	it('puts a model where it is asked to, resting on the workplane', () => {
		const s = editorReducer(start(), { type: 'addMeshes', items: one([40, -20]) });
		const node = s.history.present.nodes[s.history.present.roots[0]!]!;
		const bounds = shapeBounds(node as never);
		expect(bounds.min[2]).toBe(0);
		expect((bounds.min[0] + bounds.max[0]) / 2).toBe(40);
	});

	it('adds the several objects of one file as shapes of their own, all selected, in one undo step', () => {
		const items: MeshPlacement[] = [
			{ input: input('Left'), at: [-30, 0], lift: 0 },
			{ input: input('Right'), at: [30, 0], lift: 8 },
		];
		let s = editorReducer(start(), { type: 'addMeshes', items });
		const { roots } = s.history.present;
		expect(roots).toHaveLength(2);
		expect(s.selection).toEqual(roots);
		expect(shapeBounds(s.history.present.nodes[roots[1]!] as never).min[2]).toBe(8);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.roots).toEqual([]);
	});

	it('changes nothing for no models', () => {
		const before = start();
		expect(editorReducer(before, { type: 'addMeshes', items: [] })).toBe(before);
	});
});
