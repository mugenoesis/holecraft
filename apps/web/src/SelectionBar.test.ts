import { addShape, createEmptyDesign, type Design, groupNodes, whyNotMerge } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SelectionBar } from './SelectionBar.tsx';
import type { MergeUi } from './useMerge.ts';

/* The bar over the view on a touch screen: the editing shortcuts (Ctrl+D, Delete, Ctrl+G, Esc) as buttons. */

const twoBoxes = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [40, 0], { id: 'b' }).design;
	return d;
};
/** What useMerge gives for this selection, without doing anything. */
const mergeFor = (design: Design, selection: string[], extra: Partial<MergeUi> = {}): MergeUi => ({
	why: whyNotMerge(design, selection),
	busy: false,
	error: null,
	merge: async () => {},
	clearError: () => {},
	...extra,
});
const render = (design: Design, selection: string[], extra: Partial<MergeUi> = {}) =>
	renderToStaticMarkup(createElement(SelectionBar, { design, selection, dispatch: () => {}, merge: mergeFor(design, selection, extra) }));
const buttons = (html: string) => [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]).filter((n) => n !== 'Selection');

describe('SelectionBar', () => {
	it('is not there with nothing selected', () => {
		expect(render(twoBoxes(), [])).toBe('');
	});

	it('offers duplicate, hole, delete and done for one shape', () => {
		expect(buttons(render(twoBoxes(), ['a']))).toEqual(['Duplicate', 'Make hole', 'Delete', 'Done']);
	});

	it('offers group for two shapes', () => {
		expect(buttons(render(twoBoxes(), ['a', 'b']))).toContain('Group');
	});

	it('offers merge for two shapes and for a group, but not for one shape', () => {
		expect(buttons(render(twoBoxes(), ['a', 'b']))).toContain('Merge');
		expect(buttons(render(twoBoxes(), ['a']))).not.toContain('Merge');
		const grouped = groupNodes(twoBoxes(), ['a', 'b'], { id: 'g' }).design;
		expect(buttons(render(grouped, ['g']))).toContain('Merge');
	});

	it('says merging is under way, and shows why a merge failed', () => {
		expect(render(twoBoxes(), ['a', 'b'], { busy: true })).toContain('Merging…');
		const failed = render(twoBoxes(), ['a', 'b'], { error: 'Box 1 is not a closed shape' });
		expect(failed).toContain('role="alert"');
		expect(failed).toContain('Box 1 is not a closed shape');
	});

	it('offers ungroup for a group, and solid for a hole', () => {
		const grouped = groupNodes(twoBoxes(), ['a', 'b'], { id: 'g' }).design;
		expect(buttons(render(grouped, ['g']))).toContain('Ungroup');
		const holed = { ...grouped, nodes: { ...grouped.nodes, g: { ...grouped.nodes.g!, mode: 'hole' as const } } };
		expect(buttons(render(holed, ['g']))).toContain('Make solid');
	});
});
