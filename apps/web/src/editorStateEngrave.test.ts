import { addShape, canUndo, createEmptyDesign, type GroupNode, type ShapeNode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer } from './editorState.ts';

const input = { name: 'Engraving "Hi"', ref: 'd'.repeat(64), size: [10, 4, 2.5] as [number, number, number] };
const bounds = { min: [-5, -2, 17.5] as [number, number, number], max: [5, 2, 20] as [number, number, number] };
const start = () => createEditorState(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design);

describe('engrave', () => {
	it('groups the lettering (a hole when engraved) with its target, selects the group, and is one undo step', () => {
		let s = editorReducer(start(), { type: 'engrave', target: 'a', input, bounds, mode: 'engrave' });
		const design = s.history.present;
		expect(design.roots).toHaveLength(1);
		const group = design.nodes[design.roots[0]!] as GroupNode;
		expect(group.children).toHaveLength(2);
		expect(group.children).toContain('a');
		const lettering = design.nodes[group.children.find((c) => c !== 'a')!] as ShapeNode;
		expect(lettering.mode).toBe('hole');
		expect(lettering.params.mesh).toBe(input.ref);
		expect(s.selection).toEqual([group.id]);
		expect(canUndo(s.history)).toBe(true);
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.roots).toEqual(['a']);
	});

	it('raised lettering is a solid', () => {
		const s = editorReducer(start(), { type: 'engrave', target: 'a', input, bounds, mode: 'raised' });
		const design = s.history.present;
		const group = design.nodes[design.roots[0]!] as GroupNode;
		expect((design.nodes[group.children.find((c) => c !== 'a')!] as ShapeNode).mode).toBe('solid');
	});

	it('records nothing for a target that is not there or cannot be engraved', () => {
		const before = start();
		expect(editorReducer(before, { type: 'engrave', target: 'nope', input, bounds, mode: 'engrave' })).toBe(before);
		const locked = createEditorState({ ...before.history.present, nodes: { a: { ...before.history.present.nodes.a!, locked: true } } });
		expect(editorReducer(locked, { type: 'engrave', target: 'a', input, bounds, mode: 'engrave' })).toBe(locked);
	});
});
