import { SHAPE_DEFS } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Placing } from './placing.ts';
import { ShapesPanel } from './ShapesPanel.tsx';

const PROPS = {
	onAddShape: () => {},
	onArm: () => {},
	onLift: () => {},
	onRelease: () => {},
	touch: false,
	saved: { items: [], onAdd: () => {}, onArm: () => {}, onLift: () => {}, onRename: () => {}, onDelete: () => {} },
};

describe('the Shapes panel to start with', () => {
	const html = renderToStaticMarkup(createElement(ShapesPanel, { ...PROPS, placing: null }));

	it('has a search box and the category chips, with All chosen', () => {
		expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search shapes"/);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>All<\/button>/);
		for (const name of ['Basic', 'Parametric', 'Fasteners', 'Mine'])
			expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="false"[^>]*>${name}</button>`));
	});

	it('shows a tile for every shape, in order, and no "nothing matches" message', () => {
		const tiles = [...html.matchAll(/class="shape-tile"[^>]*>.*?<\/span>([^<]+)<\/div>/g)].map((m) => m[1]);
		expect(tiles).toEqual(SHAPE_DEFS.filter((d) => !d.noTile).map((d) => d.name)); // a sketch is drawn, not picked
		expect(html).not.toContain('No shape matches');
	});
});

describe('the Shapes panel while a shape is being placed', () => {
	const placing: Placing = { kind: 'shape', type: 'box' };
	const html = renderToStaticMarkup(createElement(ShapesPanel, { ...PROPS, placing }));

	it('shows the shape armed, and no other', () => {
		const tiles = [...html.matchAll(/<div([^>]*class="shape-tile[^"]*"[^>]*)>.*?<\/span>([^<]+)<\/div>/g)].map((m) => ({
			attrs: m[1] ?? '',
			name: m[2],
		}));
		expect(tiles).toHaveLength(SHAPE_DEFS.filter((d) => !d.noTile).length);
		expect(tiles.filter((t) => t.attrs.includes('aria-pressed="true"')).map((t) => t.name)).toEqual(['Box']);
	});

	it('says what is being placed and how to stop', () => {
		expect(html).toContain('Placing a Box: click the plane to put it down. Esc cancels.');
	});

	it('before that, says how to place one', () => {
		const idle = renderToStaticMarkup(createElement(ShapesPanel, { ...PROPS, placing: null }));
		expect(idle).toContain('Click a shape, then click the plane');
		expect(idle).not.toContain('aria-pressed="true" ');
	});

	it('on a touch screen, says a tap adds it', () => {
		expect(renderToStaticMarkup(createElement(ShapesPanel, { ...PROPS, placing: null, touch: true }))).toContain('Tap a shape to add it');
	});
});
