import { createEmptyDesign } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsMenu, SettingsPanel } from './SettingsMenu.tsx';

const props = { design: createEmptyDesign('d'), dispatch: () => {}, handleScale: 0.5, onHandleScale: () => {} };

describe('SettingsMenu', () => {
	it('shows a closed cog button', () => {
		const html = renderToStaticMarkup(createElement(SettingsMenu, props));
		expect(html).toContain('aria-label="Settings"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).not.toContain('Handle size');
	});
});

describe('SettingsPanel', () => {
	const html = renderToStaticMarkup(createElement(SettingsPanel, props));

	it('has the handle size from 10% to 200%, showing the percentage', () => {
		expect(html).toContain('Handle size (50%)');
		expect(html).toMatch(/min="0\.1"/);
		expect(html).toMatch(/max="2"/);
	});

	it('has the workplane Width and Depth', () => {
		expect(html).toContain('>Width<');
		expect(html).toContain('>Depth<');
		expect(html).toContain('value="200"');
	});

	it('enables Reset only away from the default', () => {
		expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Reset/);
		expect(renderToStaticMarkup(createElement(SettingsPanel, { ...props, handleScale: 1 }))).not.toMatch(/disabled=""[^>]*>Reset/);
	});
});
