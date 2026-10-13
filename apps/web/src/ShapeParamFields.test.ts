import { addShape, createEmptyDesign, getShapeDef, type ShapeNode, setShapeParam } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { choiceGroups, ShapeParamFields } from './ShapeParamFields.tsx';

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

describe('the Size choice with inch sizes', () => {
	it('lists the metric sizes and the inch (UNC) sizes in groups, with the one picked selected', () => {
		const html = render('threaded-rod', { size: 105 });
		expect(html).toContain('<optgroup label="Metric">');
		expect(html).toContain('<optgroup label="Inch (UNC)">');
		expect(html).toMatch(/<option value="105" selected="">1\/4-20 UNC<\/option>/);
		expect(html).toMatch(/<option value="5">M5<\/option>/);
		expect(html.indexOf('M12')).toBeLessThan(html.indexOf('#4-40 UNC')); // metric first
	});

	it('keeps a setting with no groups (a fit) as a plain list', () => {
		const html = render('threaded-hole');
		expect(html).toMatch(/<option value="2" selected="">Normal<\/option>/);
		expect(html.match(/<optgroup/g)).toHaveLength(2); // only the Size has groups
		expect(choiceGroups(getShapeDef('threaded-hole').params![1]!)).toEqual([['', expect.any(Array)]]);
	});
});
