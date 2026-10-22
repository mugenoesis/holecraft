import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { XrayBar } from './XrayBar.tsx';

const render = (props: Partial<Parameters<typeof XrayBar>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(XrayBar, {
			seeThrough: true,
			axis: null,
			at: 0,
			range: [0, 50],
			onSeeThrough: () => {},
			onAxis: () => {},
			onAt: () => {},
			...props,
		}),
	);

describe('XrayBar', () => {
	it('is a named group with a See through box, ticked when on', () => {
		const html = render();
		expect(html).toContain('role="group"');
		expect(html).toContain('aria-label="X-ray"');
		expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
		expect(html).toContain('See through');
		expect(render({ seeThrough: false })).not.toMatch(/type="checkbox"[^>]*checked/);
	});

	it('offers to cut across each axis or not at all, and no slider while there is no cut', () => {
		const html = render();
		for (const word of ['Off', 'Left to right', 'Front to back', 'Up and down']) expect(html).toContain(word);
		expect(html).not.toContain('type="range"');
	});

	it('shows a slider across the design with the position in mm once an axis is chosen', () => {
		const html = render({ axis: 'z', at: 12.5, range: [0, 50] });
		expect(html).toMatch(/<input[^>]*type="range"/);
		expect(html).toContain('min="0"');
		expect(html).toContain('max="50"');
		expect(html).toContain('value="12.5"');
		expect(html).toContain('12.5 mm');
		expect(html).toContain('aria-label="Cut position"');
	});
});
