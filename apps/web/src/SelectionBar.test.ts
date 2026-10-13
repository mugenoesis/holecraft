import { addShape, createEmptyDesign, type Design, groupNodes } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SelectionBar } from './SelectionBar.tsx';

/* The bar over the view on a touch screen: the editing shortcuts (Ctrl+D, Delete, Ctrl+G, Esc) as buttons. */

const twoBoxes = () => {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [40, 0], { id: 'b' }).design;
	return d;
};
const render = (design: Design, selection: string[]) =>
	renderToStaticMarkup(createElement(SelectionBar, { design, selection, dispatch: () => {} }));
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

	it('offers ungroup for a group, and solid for a hole', () => {
		const grouped = groupNodes(twoBoxes(), ['a', 'b'], { id: 'g' }).design;
		expect(buttons(render(grouped, ['g']))).toContain('Ungroup');
		const holed = { ...grouped, nodes: { ...grouped.nodes, g: { ...grouped.nodes.g!, mode: 'hole' as const } } };
		expect(buttons(render(holed, ['g']))).toContain('Make solid');
	});
});
