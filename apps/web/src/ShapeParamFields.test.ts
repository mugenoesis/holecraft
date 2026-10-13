import { addShape, createEmptyDesign, type ShapeNode, setShapeParam } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShapeParamFields } from './ShapeParamFields.tsx';

const render = (type: Parameters<typeof addShape>[1], settings: Record<string, number> = {}) => {
	let design = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	for (const [key, value] of Object.entries(settings)) design = setShapeParam(design, 'a', key, value);
	return renderToStaticMarkup(createElement(ShapeParamFields, { node: design.nodes.a as ShapeNode, dispatch: () => {} }));
};

describe('the fields for a shape’s own settings', () => {
	it('make a dropdown for a setting picked from a list, with every choice and the current one selected', () => {
		const html = render('threaded-hole', { size: 8, fit: 3 });
		expect(html).toContain('aria-label="Size"');
		expect(html).toContain('aria-label="Fit"');
		for (const label of ['M2', 'M5', 'M12', 'Tight', 'Normal', 'Loose']) expect(html).toContain(`>${label}</option>`);
		expect(html).toMatch(/<option value="8" selected="">M8<\/option>/);
		expect(html).toMatch(/<option value="3" selected="">Loose<\/option>/);
	});

	it('shows the bolt’s Head choice, and makes a number field (not a dropdown) for a share of the shape', () => {
		expect(render('bolt')).toMatch(/<option value="1" selected="">Hex<\/option>/);
		const tube = render('tube');
		expect(tube).toContain('Wall thickness');
		expect(tube).not.toContain('<select');
	});

	it('makes nothing for a shape with no settings', () => {
		expect(render('box')).toBe('');
	});
});
