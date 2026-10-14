import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SurfaceTool } from './surfaceTool.ts';
import { ViewToolbar } from './ViewToolbar.tsx';

const noop = () => {};
const render = (compact: boolean, tool: SurfaceTool | null = null) =>
	renderToStaticMarkup(
		createElement(ViewToolbar, {
			viewport: { current: null },
			projection: 'perspective',
			tool,
			multiSelect: false,
			onToggleMultiSelect: noop,
			onToggleTool: noop,
			planeActive: false,
			onResetPlane: noop,
			hasThreads: false,
			simpleThreads: false,
			onToggleSimpleThreads: noop,
			compact,
		}),
	);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe('ViewToolbar', () => {
	it('shows every control on a desktop', () => {
		expect(buttons(render(false))).toEqual([
			'Home view',
			'Fit all',
			'Orthographic',
			'Select',
			'Ruler',
			'Workplane',
			'Edges',
			'Paint',
			'Sketch',
		]);
	});

	it('tucks the tools into a menu in the compact layout', () => {
		const html = render(true);
		expect(buttons(html)).toEqual(['Home view', 'Fit all', 'Select']);
		expect(html).toContain('aria-haspopup="menu"');
		expect(html).toContain('Tools');
	});

	it('keeps the tool in use on the compact bar, pressed, so one tap puts it away', () => {
		const html = render(true, 'paint');
		expect(buttons(html)).toEqual(['Home view', 'Fit all', 'Select', 'Paint']);
		expect(html).toMatch(/aria-pressed="true" aria-label="Paint"/);
		expect(html).toContain('Paint ✕');
	});
});
