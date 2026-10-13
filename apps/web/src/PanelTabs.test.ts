import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelTabs } from './PanelTabs.tsx';

describe('PanelTabs', () => {
	const render = (selected: number) => renderToStaticMarkup(createElement(PanelTabs, { tab: 'edit', onTab: () => {}, selected }));

	it('shows four tabs with the current one selected', () => {
		const html = render(0);
		expect([...html.matchAll(/role="tab"/g)]).toHaveLength(4);
		expect(html).toMatch(/aria-selected="true"[^>]*>Edit</);
	});

	it('counts what is selected on the Edit tab, without changing its name', () => {
		expect(render(0)).not.toContain('panel-tab-count');
		expect(render(3)).toContain('<span class="panel-tab-count" aria-hidden="true">3</span>');
	});
});
