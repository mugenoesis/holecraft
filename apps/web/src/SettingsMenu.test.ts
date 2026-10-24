import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsMenu } from './SettingsMenu.tsx';

describe('SettingsMenu', () => {
	it('shows a closed cog button', () => {
		const html = renderToStaticMarkup(createElement(SettingsMenu, { handleScale: 1, onHandleScale: () => {} }));
		expect(html).toContain('aria-label="Settings"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).not.toContain('Handle size');
	});
});
