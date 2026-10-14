import { addShape, canUndo, createEmptyDesign, DEFAULT_PALETTE } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { createEditorState, type EditorAction, editorReducer } from './editorState.ts';

/* The colour wheel shows each colour on the shapes while it is dragged, and keeps only where it was let go. */

const start = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [40, 0], { id: 'b' }).design;
	return editorReducer(createEditorState(d), { type: 'pick', id: 'a', additive: false, phase: 'down' });
};
const run = (...actions: EditorAction[]) => actions.reduce(editorReducer, start());
const colour = (s: ReturnType<typeof start>, id: string) => s.history.present.nodes[id]!.color;

describe('previewing a shape colour', () => {
	it('shows each colour on the shapes and keeps the last as one undo step', () => {
		let s = run(
			{ type: 'colourStart' },
			{ type: 'previewColor', ids: ['a'], color: '#100000' },
			{ type: 'previewColor', ids: ['a'], color: '#200000' },
		);
		expect(colour(s, 'a')).toBe('#200000');
		expect(canUndo(s.history)).toBe(false); // nothing is kept until the release
		s = editorReducer(s, { type: 'moveEnd' });
		expect(colour(s, 'a')).toBe('#200000');
		s = editorReducer(s, { type: 'undo' });
		expect(colour(s, 'a')).toBe(start().history.present.nodes.a!.color);
	});

	it('is taken back by cancelDrag', () => {
		const s = run({ type: 'colourStart' }, { type: 'previewColor', ids: ['a'], color: '#123456' }, { type: 'cancelDrag' });
		expect(colour(s, 'a')).toBe(start().history.present.nodes.a!.color);
	});

	it('does nothing without colourStart first', () => {
		const s = run({ type: 'previewColor', ids: ['a'], color: '#123456' });
		expect(colour(s, 'a')).toBe(start().history.present.nodes.a!.color);
	});

	it('leaves shapes that are not being coloured alone', () => {
		const s = run({ type: 'colourStart' }, { type: 'previewColor', ids: ['a'], color: '#123456' });
		expect(colour(s, 'b')).toBe(start().history.present.nodes.b!.color);
	});
});

describe('previewing a palette colour', () => {
	it('works with nothing selected, and changes the shapes using the colour too', () => {
		let s = editorReducer(start(), { type: 'clearSelection' });
		s = [
			{ type: 'colourStart' } as const,
			{ type: 'previewPalette', slot: 0, color: '#abcdef' } as const,
			{ type: 'previewPalette', slot: 0, color: '#fedcba' } as const,
			{ type: 'moveEnd' } as const,
		].reduce(editorReducer, s);
		expect(s.history.present.palette[0]).toBe('#fedcba');
		expect(colour(s, 'a')).toBe('#fedcba');
		s = editorReducer(s, { type: 'undo' });
		expect(s.history.present.palette).toEqual([...DEFAULT_PALETTE]);
	});
});
