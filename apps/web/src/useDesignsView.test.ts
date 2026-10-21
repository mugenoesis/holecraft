import type { DesignSummary } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseOrder, useDesignsView } from './useDesignsView.ts';

describe('parseOrder', () => {
	it('keeps an order that is one of the three', () => {
		for (const order of ['updated', 'name', 'created'] as const) expect(parseOrder(order)).toBe(order);
	});

	it('is most recently changed first for anything else', () => {
		for (const bad of [null, '', 'newest', 'NAME']) expect(parseOrder(bad)).toBe('updated');
	});
});

describe('useDesignsView', () => {
	const summary = (id: string, name: string, folder?: string): DesignSummary => ({
		id,
		name,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: `2026-01-0${id}T00:00:00Z`,
		objectCount: 0,
		...(folder ? { folder } : {}),
	});

	/** What the hook gives for some designs on a first look, as text: the groups, the designs in each, and whether each folder is open. */
	const shown = (designs: DesignSummary[]) => {
		function Probe() {
			const view = useDesignsView(designs);
			const text = view.groups
				.map(
					(g) =>
						`${g.folder === null ? '(none)' : `${g.folder}:${view.isOpen(g.folder) ? 'open' : 'folded'}`}=${g.designs.map((d) => d.name).join('+')}`,
				)
				.join(' | ');
			return createElement('p', null, `${view.order};${view.searching};${text}`);
		}
		return renderToStaticMarkup(createElement(Probe)).replace(/<\/?p>/g, '');
	};

	it('starts on the usual order, with the designs grouped by folder and every folder open', () => {
		expect(shown([summary('1', 'Bolt'), summary('2', 'Lamp', 'Home'), summary('3', 'Shelf', 'Home')])).toBe(
			'updated;false;(none)=Bolt | Home:open=Shelf+Lamp',
		);
	});

	it('is no groups for no designs', () => {
		expect(shown([])).toBe('updated;false;');
	});
});
