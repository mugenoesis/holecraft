import { addShape, canUndo, createEmptyDesign, engravingsIn, frameOfPlane, type GroupNode, type ShapeNode } from '@holecraft/core';
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

describe('engrave with a record, and reengrave', () => {
	const record = {
		settings: { text: 'Hi', font: 1, em: 10, angle: 0, at: [0, 0] as [number, number], depth: 1, mode: 'engrave' as const },
		frame: frameOfPlane({ origin: [0, 0, 20], normal: [0, 0, 1] }),
	};
	const engraved = () => editorReducer(start(), { type: 'engrave', target: 'a', input, bounds, mode: 'engrave', record });
	const input2 = { name: 'Engraving "Bye"', ref: 'e'.repeat(64), size: [20, 6, 3] as [number, number, number] };
	const bounds2 = { min: [-10, -3, 16] as [number, number, number], max: [10, 3, 19] as [number, number, number] };

	it('keeps the record on the engraving it makes', () => {
		const design = engraved().history.present;
		expect(engravingsIn(design, design.roots[0]!)).toHaveLength(1);
	});

	it('swaps the lettering for the new one as one undo step that keeps the group selected, and undo brings the old one back', () => {
		let s = engraved();
		const group = s.history.present.roots[0]!;
		const id = engravingsIn(s.history.present, group)[0]!.id;
		s = editorReducer(s, {
			type: 'reengrave',
			id,
			input: input2,
			bounds: bounds2,
			record: { ...record, settings: { ...record.settings, text: 'Bye' } },
		});
		const swapped = s.history.present.nodes[id] as ShapeNode;
		expect(swapped.params.mesh).toBe(input2.ref);
		expect(engravingsIn(s.history.present, group)[0]?.record.settings.text).toBe('Bye');
		expect(s.selection).toEqual([group]);
		s = editorReducer(s, { type: 'undo' });
		expect((s.history.present.nodes[id] as ShapeNode).params.mesh).toBe(input.ref);
	});

	it('records nothing for a shape that is not an engraving', () => {
		const s = engraved();
		expect(editorReducer(s, { type: 'reengrave', id: 'a', input: input2, bounds: bounds2, record })).toBe(s);
	});
});
