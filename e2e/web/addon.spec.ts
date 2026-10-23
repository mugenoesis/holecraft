import { readFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { CaughtFiles } from '../../apps/addon/src/caught.ts';
import { createController } from '../../apps/addon/src/controller.ts';
import { diagnose } from '../../apps/addon/src/diagnostics.ts';
import { RecentLog } from '../../apps/addon/src/recent.ts';
import { EMPTY_SETTINGS, type Settings } from '../../apps/addon/src/settings.ts';
import { cubeStl, deflatedZip } from './modelFiles.ts';

/*
 * The browser add-on's own pages (the popup and the settings page), as built, in a browser. The browser's extension API is a small stand-in in the page
 * that passes every message to the add-on's real background logic (the controller) running here, which talks to the real Holecraft server: so a
 * file "caught" on its way down is sent through the popup and ends up as a design. (What cannot be tried here is Firefox itself: copying a download.)
 */

const DIST = path.resolve(import.meta.dirname, '../../apps/addon/dist');
const ORIGIN = 'http://addon.test';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

// the pages are served from the built add-on: a clean checkout has none until scripts/package-addon.sh has run (scripts/check.sh and scripts/e2e.sh do it)
test.beforeAll(async () => {
	await expect(readFile(path.join(DIST, 'manifest.json')), 'Build the add-on first: scripts/package-addon.sh').resolves.toBeDefined();
});

interface Harness {
	files: CaughtFiles;
	log: RecentLog;
	opened: string[];
	settings: Settings;
}

/** Serves the built add-on pages from a made-up address and gives them the stand-in browser API. */
async function openAddon(page: Page, baseURL: string, over: Partial<Settings> = {}): Promise<Harness> {
	const h: Harness = {
		files: new CaughtFiles(),
		log: new RecentLog(),
		opened: [],
		settings: { ...EMPTY_SETTINGS, holecraftUrl: baseURL, ...over },
	};
	const handle = createController({
		files: h.files,
		log: h.log,
		loadSettings: async () => h.settings,
		saveSettings: async (s) => {
			h.settings = s;
		},
		fetchFn: (input, init) => fetch(input, init),
		openTab: async (url) => {
			h.opened.push(url);
		},
		diagnose: () =>
			diagnose({
				browser: {
					webRequest: { onHeadersReceived: {} },
					tabs: { create: () => {} },
					browserAction: { setBadgeText: () => {} },
					storage: { local: {} },
				},
				userAgent: 'Firefox/140.0 test',
			}),
		onChange: () => {},
		maxBytes: 100 * 1024 * 1024,
	});
	await page.exposeFunction('__background', (request: unknown) => handle(request as never));
	await page.addInitScript(() => {
		const w = window as unknown as {
			__background: (r: unknown) => Promise<unknown>;
			browser: unknown;
			__optionsOpened?: boolean;
			__deliver: (message: unknown) => void;
		};
		// what a page's content script is given by the background page: it listens for messages, and the test sends one
		const listeners: ((message: unknown) => void)[] = [];
		w.__deliver = (message) => {
			for (const l of listeners) l(message);
		};
		w.browser = {
			runtime: {
				sendMessage: (r: unknown) => w.__background(r),
				onMessage: { addListener: (fn: (message: unknown) => void) => listeners.push(fn) },
				openOptionsPage: async () => {
					w.__optionsOpened = true;
				},
			},
		};
	});
	await page.route(`${ORIGIN}/**`, async (route) => {
		if (new URL(route.request().url()).pathname === '/page.html') {
			return route.fulfill({
				body: '<!doctype html><html lang="en"><title>A model page</title><main><h1>A page on a site</h1><p>Some text</p></main>',
				contentType: 'text/html',
			});
		}
		const name = new URL(route.request().url()).pathname.slice(1);
		try {
			const body = await readFile(path.join(DIST, name));
			await route.fulfill({ body, contentType: TYPES[path.extname(name)] ?? 'application/octet-stream' });
		} catch {
			await route.fulfill({ status: 404, body: 'not found' });
		}
	});
	return h;
}

const caughtModel = (h: Harness, name = 'Gear.stl') =>
	h.files.add({
		name,
		kind: 'model',
		size: 684,
		url: `https://cdn.example.com/${name}`,
		site: 'MakerWorld',
		bytes: new Uint8Array(cubeStl(12)),
	});

test.describe('the add-on’s popup', () => {
	test('says what to do when nothing has been caught', async ({ page, baseURL }) => {
		await openAddon(page, baseURL!);
		await page.goto(`${ORIGIN}/popup.html`);
		await expect(page.getByText(/Download a model on MakerWorld, Printables or Thingiverse/)).toBeVisible();
	});

	test('lists a caught model, and Open in Holecraft sends it so it opens as a design', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		caughtModel(h);
		await page.goto(`${ORIGIN}/popup.html`);
		await expect(page.getByText('Gear.stl')).toBeVisible();
		await expect(page.getByText(/MakerWorld · 684 B/)).toBeVisible();
		await page.getByRole('button', { name: 'Open in Holecraft' }).click();
		await expect.poll(() => h.opened.length).toBe(1);
		expect(h.files.count()).toBe(0);

		const editor = await page.context().newPage();
		await editor.goto(h.opened[0]!);
		await expect(editor).toHaveURL(/\/design\/[0-9a-f]{32}$/);
		await expect(editor.getByRole('textbox', { name: 'Design name' })).toHaveValue('Gear');
		await expect(editor.getByTestId('object-list').locator('li')).toHaveCount(1);
	});

	test('sends a zip to Holecraft whole, which then asks which model to open', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		h.files.add({
			name: 'Kit.zip',
			kind: 'zip',
			size: null,
			url: 'https://cdn.example.com/Kit.zip',
			site: 'Printables',
			bytes: new Uint8Array(deflatedZip({ 'Left.stl': cubeStl(10), 'Right.stl': cubeStl(10), 'photo.png': Buffer.from([1]) })),
		});
		await page.goto(`${ORIGIN}/popup.html`);
		await page.getByRole('button', { name: 'Open in Holecraft' }).click();
		await expect.poll(() => h.opened.length).toBe(1);
		const editor = await page.context().newPage();
		await editor.goto(h.opened[0]!);
		await expect(editor.getByRole('heading', { name: 'Which models do you want to open?' })).toBeVisible();
		await expect(editor.getByRole('checkbox')).toHaveCount(2);
	});

	test('offers each model in a zip for Trident, and turns Trident off when it is not set up', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		h.files.add({
			name: 'Kit.zip',
			kind: 'zip',
			size: null,
			url: 'https://cdn.example.com/Kit.zip',
			site: 'Printables',
			bytes: new Uint8Array(deflatedZip({ 'parts/Left.stl': cubeStl(10), 'Right.3mf': cubeStl(10) })),
		});
		await page.goto(`${ORIGIN}/popup.html`);
		const left = page.getByRole('button', { name: 'Open in Trident: Left.stl' });
		await expect(left).toBeVisible();
		await expect(page.getByRole('button', { name: 'Open in Trident: Right.3mf' })).toBeVisible();
		await expect(left).toBeDisabled();
		await expect(left).toHaveAttribute('title', /Set up Trident/);
	});

	test('shows why sending failed, and keeps the file', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!, { holecraftUrl: 'http://127.0.0.1:1' });
		caughtModel(h);
		await page.goto(`${ORIGIN}/popup.html`);
		await page.getByRole('button', { name: 'Open in Holecraft' }).click();
		await expect(page.getByRole('alert')).toContainText('Could not reach Holecraft at http://127.0.0.1:1');
		expect(h.files.count()).toBe(1);
		expect(h.opened).toEqual([]);
	});

	test('Dismiss forgets a file', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		caughtModel(h);
		await page.goto(`${ORIGIN}/popup.html`);
		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect(page.getByText(/Nothing yet/)).toBeVisible();
		expect(h.files.count()).toBe(0);
	});

	test('passes the accessibility scan', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		caughtModel(h);
		await page.goto(`${ORIGIN}/popup.html`);
		await expect(page.getByText('Gear.stl')).toBeVisible();
		expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
	});
});

test.describe('the add-on’s settings page', () => {
	test('shows the saved settings, saves new ones tidied, and checks Holecraft', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!, { tridentUrl: '' });
		await page.goto(`${ORIGIN}/options.html`);
		await expect(page.getByLabel('Address').first()).toHaveValue(baseURL!);
		const bare = new URL(baseURL!).host;
		await page.getByLabel('Address').first().fill(`${bare}/`);
		await page.getByRole('button', { name: 'Check Holecraft' }).click();
		await expect(page.locator('#holecraftResult')).toContainText(/Holecraft .*answered at/);
		expect(h.settings.holecraftUrl).toBe(`http://${bare}`);
		await page.getByLabel('API key').fill('  k  ');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('#saved')).toHaveText('Saved');
		expect(h.settings.tridentKey).toBe('k');
	});

	test('says when Trident cannot be reached', async ({ page, baseURL }) => {
		await openAddon(page, baseURL!, { tridentUrl: 'http://127.0.0.1:1' });
		await page.goto(`${ORIGIN}/options.html`);
		await page.getByRole('button', { name: 'Check Trident' }).click();
		await expect(page.locator('#tridentResult')).toContainText('Could not reach Trident');
	});

	test('lists what the browser can do, and the downloads seen lately with no signed address in them', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		h.log.add({
			at: 1,
			site: 'MakerWorld',
			url: 'https://cdn.example.com/files/abc',
			status: 200,
			contentType: 'application/octet-stream',
			disposition: 'attachment; filename="Gear.stl"',
			name: 'Gear.stl',
			kind: 'model',
			note: 'Caught: copying the file as it comes down',
		});
		await page.goto(`${ORIGIN}/options.html`);
		await expect(page.getByText('Yes: Watch downloads')).toBeVisible();
		await expect(page.getByText('Not here: Copy a download as it comes down')).toBeVisible();
		await expect(page.getByText(/MakerWorld: Gear\.stl \(model\)/)).toBeVisible();
		await expect(page.getByText(/200 https:\/\/cdn\.example\.com\/files\/abc/)).toBeVisible();
		await page.getByRole('button', { name: 'Clear' }).click();
		await expect(page.getByText(/Nothing yet/)).toBeVisible();
	});

	test('passes the accessibility scan', async ({ page, baseURL }) => {
		await openAddon(page, baseURL!);
		await page.goto(`${ORIGIN}/options.html`);
		await expect(page.getByRole('heading', { name: 'Holecraft Send: settings' })).toBeVisible();
		expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
	});
});

const banner = (page: Page) => page.locator('#holecraft-send-banner');

/** Opens a page that stands for the one a file came down in, and gives it the banner script, as the background page does. */
async function pageWithBanner(page: Page) {
	await page.goto(`${ORIGIN}/page.html`);
	await page.addScriptTag({ path: path.join(DIST, 'toast.js') });
}
const announce = (page: Page, id: string) =>
	page.evaluate(
		(fileId) => (window as unknown as { __deliver: (m: unknown) => void }).__deliver({ type: 'holecraft-send-banner', id: fileId }),
		id,
	);

test.describe('the banner on the page a file came down in', () => {
	test('says what was caught, and has the buttons to send it', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!, { tridentUrl: 'http://127.0.0.1:1' });
		const id = caughtModel(h);
		await pageWithBanner(page);
		await announce(page, id);
		await expect(banner(page).getByText('Caught Gear.stl')).toBeVisible();
		await expect(banner(page).getByText(/MakerWorld · 684 B/)).toBeVisible();
		await expect(banner(page).getByRole('button', { name: 'Open in Holecraft' })).toBeEnabled();
		await expect(banner(page).getByRole('button', { name: 'Open in Trident' })).toBeEnabled();
		await expect(banner(page).getByRole('button', { name: 'Hide' })).toBeVisible();
	});

	test('Open in Holecraft sends the file so it opens as a design, and the banner goes', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		const id = caughtModel(h);
		await pageWithBanner(page);
		await announce(page, id);
		await banner(page).getByRole('button', { name: 'Open in Holecraft' }).click();
		await expect.poll(() => h.opened.length).toBe(1);
		await expect(banner(page).getByText('Caught Gear.stl')).toHaveCount(0);
		expect(h.files.count()).toBe(0);
		const editor = await page.context().newPage();
		await editor.goto(h.opened[0]!);
		await expect(editor.getByTestId('object-list').locator('li')).toHaveCount(1);
	});

	test('shows why sending failed in the banner, keeps the file, and lets it be tried again', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!, { holecraftUrl: 'http://127.0.0.1:1' });
		const id = caughtModel(h);
		await pageWithBanner(page);
		await announce(page, id);
		await banner(page).getByRole('button', { name: 'Open in Holecraft' }).click();
		await expect(banner(page).getByRole('alert')).toContainText('Could not reach Holecraft at http://127.0.0.1:1');
		await expect(banner(page).getByRole('button', { name: 'Open in Holecraft' })).toBeEnabled();
		expect(h.files.count()).toBe(1);
	});

	test('Hide takes the banner away but keeps the file for the toolbar button', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		const id = caughtModel(h);
		await pageWithBanner(page);
		await announce(page, id);
		await banner(page).getByRole('button', { name: 'Hide' }).click();
		await expect(banner(page).getByText('Caught Gear.stl')).toHaveCount(0);
		expect(h.files.count()).toBe(1);
	});

	test('shows a banner for each file, and one banner only however often the script is put on the page', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		const a = caughtModel(h, 'A.stl');
		const b = caughtModel(h, 'B.stl');
		await pageWithBanner(page);
		await page.addScriptTag({ path: path.join(DIST, 'toast.js') });
		await announce(page, a);
		await announce(page, b);
		await expect(banner(page).getByText('Caught A.stl')).toHaveCount(1);
		await expect(banner(page).getByText('Caught B.stl')).toHaveCount(1);
	});

	test('offers each model in a zip for Trident, as the popup does', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!, { tridentUrl: 'http://127.0.0.1:1' });
		const id = h.files.add({
			name: 'Kit.zip',
			kind: 'zip',
			size: null,
			url: 'https://cdn.example.com/Kit.zip',
			site: 'Printables',
			bytes: new Uint8Array(deflatedZip({ 'Left.stl': cubeStl(10), 'Right.stl': cubeStl(10) })),
		});
		await pageWithBanner(page);
		await announce(page, id);
		await expect(banner(page).getByRole('button', { name: 'Open in Trident: Left.stl' })).toBeVisible();
		await expect(banner(page).getByRole('button', { name: 'Open in Trident: Right.stl' })).toBeVisible();
	});

	test('does not let the page change how it looks (it lives in a shadow root)', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		const id = caughtModel(h);
		await pageWithBanner(page);
		await page.addStyleTag({ content: 'button { display: none !important; } .card, .title { color: red !important; }' });
		await announce(page, id);
		await expect(banner(page).getByRole('button', { name: 'Open in Holecraft' })).toBeVisible();
	});

	test('says nothing for a file that is gone', async ({ page, baseURL }) => {
		await openAddon(page, baseURL!);
		await pageWithBanner(page);
		await announce(page, 'not-there');
		await page.waitForTimeout(300);
		await expect(banner(page)).toHaveCount(0);
	});

	test('passes the accessibility scan', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		const id = caughtModel(h);
		await pageWithBanner(page);
		await announce(page, id);
		await expect(banner(page).getByText('Caught Gear.stl')).toBeVisible();
		expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('#holecraft-send-banner').analyze()).violations).toEqual(
			[],
		);
	});
});

test.describe('the settings page: telling you about a file', () => {
	test('has a banner on and a notification off to start with, and keeps what is chosen', async ({ page, baseURL }) => {
		const h = await openAddon(page, baseURL!);
		await page.goto(`${ORIGIN}/options.html`);
		await expect(page.getByLabel(/Show a banner on the page/)).toBeChecked();
		await expect(page.getByLabel(/Also show a notification/)).not.toBeChecked();
		await page.getByLabel(/Show a banner on the page/).uncheck();
		await page.getByLabel(/Also show a notification/).check();
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('#saved')).toHaveText('Saved');
		expect([h.settings.showBanner, h.settings.showNotification]).toEqual([false, true]);
		await page.reload();
		await expect(page.getByLabel(/Show a banner on the page/)).not.toBeChecked();
		await expect(page.getByLabel(/Also show a notification/)).toBeChecked();
	});
});
