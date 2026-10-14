import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, type Page, test } from '@playwright/test';
import { dropShape, newDesign } from './helpers.ts';

/** A stand-in for a Trident slicer that records what it is sent. Holecraft's server (in the same container) talks to it. */
interface Fake {
	url: string;
	uploads: { authorization: string | undefined; body: Buffer }[];
	status: number;
	close: () => Promise<void>;
}

async function fakeTrident(): Promise<Fake> {
	const fake: Fake = { url: '', uploads: [], status: 200, close: async () => undefined };
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			if (req.method === 'POST' && req.url === '/models') {
				fake.uploads.push({ authorization: req.headers.authorization, body: Buffer.concat(chunks) });
				res.writeHead(fake.status, { 'content-type': 'application/json' });
				res.end(JSON.stringify(fake.status === 200 ? { model_id: 'm42', filename: 'x.3mf' } : { detail: 'no' }));
				return;
			}
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end('<title>Fake Trident</title><p>Fake Trident</p>');
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	fake.close = () =>
		new Promise((resolve) => {
			server.closeAllConnections();
			server.close(() => resolve());
		});
	return fake;
}

/** The dropdown: its items are a menu, and the setup form, messages and settings link sit beside them. */
const menu = (page: Page) => page.locator('.export-menu .menu');
const sendRow = (page: Page) => page.getByRole('menu', { name: 'Export format' }).getByRole('menuitem', { name: /Send to Trident/ });

async function openMenu(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(menu(page)).toBeVisible();
}

let fake: Fake;

test.beforeEach(async ({ page, request }) => {
	await request.delete('/api/trident');
	fake = await fakeTrident();
	await newDesign(page);
	await dropShape(page, 'Box');
});

test.afterEach(async ({ request }) => {
	await fake.close();
	await request.delete('/api/trident');
});

test.describe('send to Trident', () => {
	test('the first time it asks where Trident is and for a key, then sends and opens the model in a new tab', async ({ page }) => {
		await openMenu(page);
		await expect(sendRow(page)).toContainText('Opens it in the slicer');
		await sendRow(page).click();

		await expect(menu(page).getByLabel('Address')).toHaveValue(/^http:\/\/.+:8000$/); // a guess from where Holecraft is open
		await menu(page).getByLabel('Address').fill(fake.url);
		await menu(page).getByLabel('API key').fill('trident_abc');
		const [popup] = await Promise.all([page.waitForEvent('popup'), menu(page).getByRole('button', { name: 'Save and send' }).click()]);
		await expect.poll(() => popup.url()).toBe(`${fake.url}/?model=m42`);

		expect(fake.uploads).toHaveLength(1);
		expect(fake.uploads[0]?.authorization).toBe('Bearer trident_abc');
		const body = fake.uploads[0]!.body.toString('latin1');
		expect(body).toContain('PK'); // a 3MF is a zip
		expect(body).toContain('Metadata/project_settings.config'); // the OrcaSlicer flavour, with the filaments
		expect(body).toMatch(/filename="[^"]+\.3mf"/);
		await popup.close();
	});

	test('once it is set up it is one click, and the menu shows where it goes', async ({ page, request }) => {
		await request.put('/api/trident', { data: { url: fake.url, key: 'trident_abc' } });
		await openMenu(page);
		await expect(sendRow(page)).toContainText(fake.url.replace('http://', ''));
		const [popup] = await Promise.all([page.waitForEvent('popup'), sendRow(page).click()]);
		await expect.poll(() => popup.url()).toBe(`${fake.url}/?model=m42`);
		expect(fake.uploads).toHaveLength(1);
		await popup.close();
	});

	test('says what went wrong and keeps the menu open, with a way to change the settings', async ({ page, request }) => {
		fake.status = 401;
		await request.put('/api/trident', { data: { url: fake.url, key: 'wrong' } });
		await openMenu(page);
		await sendRow(page).click();
		await expect(menu(page).getByRole('alert')).toContainText(/401/);
		await expect(menu(page).getByRole('alert')).toContainText(/key/i);
		await expect(menu(page).getByRole('button', { name: 'Trident settings…' })).toBeVisible();
		expect(page.context().pages()).toHaveLength(1); // the tab it opened for the model was closed again
	});

	test('the settings can be changed without showing the key again, and forgotten', async ({ page, request }) => {
		await request.put('/api/trident', { data: { url: fake.url, key: 'trident_abc' } });
		await openMenu(page);
		await menu(page).getByRole('button', { name: 'Trident settings…' }).click();
		await expect(menu(page).getByLabel('Address')).toHaveValue(fake.url);
		await expect(menu(page).getByLabel('API key')).toHaveValue(''); // it is never shown again
		await expect(menu(page).getByLabel('API key')).toHaveAttribute('placeholder', /saved/i);
		await menu(page).getByRole('button', { name: 'Forget' }).click();
		await expect(sendRow(page)).toContainText('Opens it in the slicer');
		expect((await (await request.get('/api/trident')).json()) as { url: string | null }).toMatchObject({ url: null });
	});

	test('refuses an address that is not one, and says so in the form', async ({ page }) => {
		await openMenu(page);
		await sendRow(page).click();
		await menu(page).getByLabel('Address').fill('javascript:alert(1)');
		await menu(page).getByRole('button', { name: 'Save and send' }).click();
		await expect(menu(page).getByRole('alert')).toContainText(/address/i);
		expect(fake.uploads).toHaveLength(0);
	});

	test('only sends the selection when asked to', async ({ page, request }) => {
		await dropShape(page, 'Sphere', 200, 0);
		await request.put('/api/trident', { data: { url: fake.url } });
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		await openMenu(page);
		await menu(page)
			.getByLabel(/Only the selected/)
			.check();
		const [popup] = await Promise.all([page.waitForEvent('popup'), sendRow(page).click()]);
		await expect.poll(() => popup.url()).toBe(`${fake.url}/?model=m42`);
		const body = fake.uploads[0]!.body.toString('latin1');
		expect(body).toContain('Box 1');
		expect(body).not.toContain('Sphere 1');
		await popup.close();
	});
});
