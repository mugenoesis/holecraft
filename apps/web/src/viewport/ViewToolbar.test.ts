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
			xrayOn: false,
			onToggleXray: noop,
			compact,
		}),
	);
const buttons = (html: string) => [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);

describe('ViewToolbar', () => {
	it('shows every control on a desktop', () => {
		expect(buttons(render(false))).toEqual([
			'Home view',
			'Fit all',
			'Ortho (orthographic projection)',
			'Select',
			'Ruler',
			'Workplane',
			'Edges',
			'Paint',
			'Sketch',
			'X-ray',
		]);
	});

	// WCAG 2.5.3 (Label in Name), which axe 4.14 checks: someone who says what they see on a button (voice control) must hit it, so the visible
	// words have to be words of the accessible name.
	it('names every button so that the words on it are in its name', () => {
		for (const compact of [false, true]) {
			for (const [, label, text] of render(compact).matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>([^<]*)</g)) {
				const name = label!.toLowerCase().split(/[^a-z0-9]+/);
				for (const word of text!
					.toLowerCase()
					.split(/[^a-z0-9]+/)
					.filter(Boolean)) {
					expect(name, `"${text}" on the button named "${label}"`).toContain(word);
				}
			}
		}
	});

	it('tucks the tools into a menu in the compact layout', () => {
		const html = render(true);
		expect(buttons(html)).toEqual(['Home view', 'Fit all', 'Select']);
		expect(html).toContain('aria-haspopup="menu"');
		expect(html).toContain('Tools');
	});

	it('keeps the X-ray switch out of the compact bar (it is in the Tools menu, and its controls show over the view)', () => {
		const on = renderToStaticMarkup(
			createElement(ViewToolbar, {
				viewport: { current: null },
				projection: 'perspective',
				tool: null,
				multiSelect: false,
				onToggleMultiSelect: noop,
				onToggleTool: noop,
				planeActive: false,
				onResetPlane: noop,
				hasThreads: false,
				simpleThreads: false,
				onToggleSimpleThreads: noop,
				xrayOn: true,
				onToggleXray: noop,
				compact: true,
			}),
		);
		expect(buttons(on)).toEqual(['Home view', 'Fit all', 'Select']);
	});

	it('presses the X-ray button while it is on, on a desktop', () => {
		expect(render(false)).toMatch(/aria-pressed="false" aria-label="X-ray"/);
	});

	it('keeps the tool in use on the compact bar, pressed, so one tap puts it away', () => {
		const html = render(true, 'paint');
		expect(buttons(html)).toEqual(['Home view', 'Fit all', 'Select', 'Paint']);
		expect(html).toMatch(/aria-pressed="true" aria-label="Paint"/);
		expect(html).toContain('Paint ✕');
	});
});
