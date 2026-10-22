import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EngraveOverlay } from './EngraveOverlay.tsx';

const rings: [number, number][][] = [
	[
		[0, 0],
		[10, 0],
		[10, 4],
		[0, 4],
	],
	[
		[2, 1],
		[2, 3],
		[4, 3],
		[4, 1],
	],
];
const render = (polygons: [number, number][][] | null) =>
	renderToStaticMarkup(createElement(EngraveOverlay, { polygons, toScreen: ([x, y]) => [x * 3 + 100, 200 - y * 3] }));

describe('EngraveOverlay', () => {
	it('draws the words as one even-odd path over the view, through the screen positions, letter holes left open', () => {
		const html = render(rings);
		expect(html).toContain('data-testid="engrave-overlay"');
		expect(html).toContain('fill-rule="evenodd"');
		expect(html).toContain('M100,200L130,200L130,188L100,188Z');
		expect(html).toContain('M106,197L106,191L112,191L112,197Z');
	});

	it('draws nothing for words with no ink', () => {
		expect(render(null)).not.toContain('<path');
	});

	it('does not catch the pointer, so the view under it still gets the clicks and drags', () => {
		expect(render(rings)).toContain('class="sketch-overlay"');
	});
});
