import { SHAPE_DEFS } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShapesPanel } from './ShapesPanel.tsx';

describe('the Shapes panel to start with', () => {
	const html = renderToStaticMarkup(
		createElement(ShapesPanel, { onAddShape: () => {}, saved: { items: [], onAdd: () => {}, onRename: () => {}, onDelete: () => {} } }),
	);

	it('has a search box and the category chips, with All chosen', () => {
		expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search shapes"/);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>All<\/button>/);
		for (const name of ['Basic', 'Parametric', 'Fasteners', 'Mine'])
			expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*>${name}</button>`));
	});

	it('shows a tile for every shape, in order, and no "nothing matches" message', () => {
		const tiles = [...html.matchAll(/class="shape-tile"[^>]*>.*?<\/span>([^<]+)<\/div>/g)].map((m) => m[1]);
		expect(tiles).toEqual(SHAPE_DEFS.map((d) => d.name));
		expect(html).not.toContain('No shape matches');
	});
});
