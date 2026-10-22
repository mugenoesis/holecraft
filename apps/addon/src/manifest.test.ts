import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The manifest is what Firefox reads first; a mistake in it means the add-on does not load at all, and the browser's error is not friendly. */

const here = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(path.join(here, 'static/manifest.json'), 'utf8')) as {
	manifest_version: number;
	name: string;
	description: string;
	permissions: string[];
	background: { scripts: string[]; persistent: boolean };
	browser_action: { default_popup: string };
	options_ui: { page: string };
	icons: Record<string, string>;
	browser_specific_settings: { gecko: { id: string; data_collection_permissions: unknown }; gecko_android?: unknown };
};

describe('the add-on manifest', () => {
	it('is manifest version 2, which Firefox keeps (and which Firefox for Android runs with a page that stays loaded)', () => {
		expect(manifest.manifest_version).toBe(2);
		expect(manifest.background.persistent).toBe(true);
	});

	it('has an id of the shape addons.mozilla.org takes, and a name and description', () => {
		expect(manifest.browser_specific_settings.gecko.id).toMatch(/^[a-z0-9._-]+@[a-z0-9.-]+$/);
		expect(manifest.name).toBe('Holecraft Send');
		expect(manifest.description.length).toBeGreaterThan(20);
	});

	it('says it collects no data, as addons.mozilla.org asks of a new add-on', () => {
		expect(manifest.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'] });
	});

	it('asks only for what it uses: to see and copy responses, open tabs and keep settings', () => {
		expect([...manifest.permissions].sort()).toEqual(['<all_urls>', 'storage', 'tabs', 'webRequest', 'webRequestBlocking']);
	});

	it('runs on Firefox for Android too', () => {
		expect(manifest.browser_specific_settings.gecko_android).toBeDefined();
	});

	it('names pages and scripts that exist (the built ones come from src/, the rest from static/)', async () => {
		const built = new Set(['background.js', 'popup.js', 'options.js', 'icon.png']);
		const named = [
			...manifest.background.scripts,
			manifest.browser_action.default_popup,
			manifest.options_ui.page,
			...Object.values(manifest.icons),
		] as string[];
		for (const file of named) {
			if (built.has(file)) continue;
			await expect(readFile(path.join(here, 'static', file)), file).resolves.toBeDefined();
		}
		for (const entry of ['background', 'popup', 'options'])
			await expect(readFile(path.join(here, `src/${entry}.ts`))).resolves.toBeDefined();
	});

	it('has its pages load only scripts and styles that the build makes', async () => {
		for (const page of ['popup.html', 'options.html']) {
			const html = await readFile(path.join(here, 'static', page), 'utf8');
			const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
			expect(scripts.length, page).toBeGreaterThan(0);
			for (const s of scripts) expect(['popup.js', 'options.js'], s).toContain(s);
			expect(html).toContain('href="addon.css"');
		}
	});
});
