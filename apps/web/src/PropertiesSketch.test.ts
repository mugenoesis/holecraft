import { addShape, addSketchShape, createEmptyDesign, rectangleOutline, setLocked } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PropertiesPanel } from './PropertiesPanel.tsx';

const library = {
	items: [],
	save: async () => true,
	open: async () => null,
	rename: async () => {},
	remove: async () => {},
	problem: null,
} as never;
const render = (design: ReturnType<typeof createEmptyDesign>, id: string, onEditSketch?: (id: string) => void) =>
	renderToStaticMarkup(
		createElement(PropertiesPanel, { design, selection: [id], dispatch: () => {}, library, ...(onEditSketch && { onEditSketch }) }),
	);
const sketch = () =>
	addSketchShape(createEmptyDesign('d'), { origin: [0, 0, 0], normal: [0, 0, 1] }, [rectangleOutline([0, 0], [10, 10])], 5, { id: 's' })
		.design;

describe('Properties of a sketch', () => {
	it('has an Edit sketch button, and the usual size fields (the drawing stretches to them)', () => {
		const html = render(sketch(), 's', () => {});
		expect(html).toMatch(/<button[^>]*>Edit sketch<\/button>/);
		for (const label of ['Width', 'Depth', 'Height']) expect(html).toContain(`<span>${label}</span>`);
	});

	it('has no Edit sketch button on any other shape', () => {
		const d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		expect(render(d, 'b', () => {})).not.toContain('Edit sketch');
	});

	it('has it off for a locked sketch (it cannot be redrawn)', () => {
		const html = render(setLocked(sketch(), ['s'], true), 's', () => {});
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Edit sketch<\/button>/);
	});
});
