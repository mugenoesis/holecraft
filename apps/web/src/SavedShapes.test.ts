import type { LibrarySummary } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { matchingSaved, SavedShapes } from './SavedShapes.tsx';

const item = (name: string, color = '#336699'): LibrarySummary => ({
	id: name.toLowerCase().replace(/\W/g, '').padEnd(32, '0'),
	name,
	color,
	createdAt: 'x',
});
const items = [item('Bracket with bolts'), item('Hinge'), item('Plate')];
const render = (list: LibrarySummary[], query = '') =>
	renderToStaticMarkup(createElement(SavedShapes, { items: list, query, onAdd: () => {}, onRename: () => {}, onDelete: () => {} }));

describe('matchingSaved', () => {
	it('gives all of them, in order, for no search', () => {
		expect(matchingSaved(items, '').map((i) => i.name)).toEqual(['Bracket with bolts', 'Hinge', 'Plate']);
		expect(matchingSaved(items, '   ')).toHaveLength(3);
	});

	it('needs every word of the search somewhere in the name, ignoring case', () => {
		expect(matchingSaved(items, 'BOLT').map((i) => i.name)).toEqual(['Bracket with bolts']);
		expect(matchingSaved(items, 'with brack').map((i) => i.name)).toEqual(['Bracket with bolts']);
		expect(matchingSaved(items, 'hinge plate')).toEqual([]);
		expect(matchingSaved(items, 'zzz')).toEqual([]);
	});
});

describe('the Mine view', () => {
	it('shows a tile for each saved shape, with its colour, and the Manage switch off', () => {
		const html = render(items);
		expect(html.match(/class="shape-tile"/g)).toHaveLength(3);
		expect(html).toContain('background-color:#336699');
		expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
		expect(html).not.toMatch(/<input[^>]*checked/);
		expect(html).not.toContain('Rename');
	});

	it('says what to do when nothing is saved, or nothing matches', () => {
		expect(render([])).toContain('Nothing saved yet. Select a shape or group and use Save to library in Properties.');
		expect(render(items, 'zzz')).toContain('No saved shape matches “zzz”');
		expect(render(items, 'hinge')).not.toContain('No saved shape');
	});
});
