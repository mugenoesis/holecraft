import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { cube3mf, cubeStl, deflatedZip, sphereStl } from './modelFiles.ts';

/*
 * Files the browser add-on sends: POST /api/import keeps one for a while and says where to open it; /import/<id> turns it into a new design (a zip
 * with several models asks which first) and deletes it from the server. Sent here the way the add-on sends them: with its header and content type.
 */

const TYPE = 'application/vnd.holecraft.import';

/** Sends a file as the add-on does; the address it says to open. */
async function send(page: Page, name: string, data: Buffer): Promise<{ id: string; openUrl: string }> {
	const res = await page.request.post('/api/import', {
		data,
		headers: { 'content-type': TYPE, 'x-holecraft-import': '1', 'x-file-name': encodeURIComponent(name) },
	});
	expect(res.status()).toBe(201);
	return res.json();
}

const objects = (page: Page) => page.getByTestId('object-list').locator('li');
const designName = (page: Page) => page.getByRole('textbox', { name: 'Design name' });

test.describe('files sent by the browser add-on', () => {
	test('a model file becomes a new design named for it, and the file is forgotten', async ({ page }) => {
		const { id, openUrl } = await send(page, 'Wall Bracket v2.stl', cubeStl(20));
		await page.goto(openUrl);
		await expect(page).toHaveURL(/\/design\/[0-9a-f]{32}$/);
		await expect(designName(page)).toHaveValue('Wall Bracket v2');
		await expect(objects(page)).toHaveCount(1);
		await expect(page.getByTestId('object-list')).toContainText('Wall Bracket v2');
		expect((await page.request.get(`/api/import/${id}`)).status()).toBe(404);
	});

	test('the screen it came through is not left in the back button', async ({ page }) => {
		await page.goto('/');
		const { openUrl } = await send(page, 'Part.stl', cubeStl(10));
		await page.goto(openUrl);
		await expect(page).toHaveURL(/\/design\//);
		await page.goBack();
		await expect(page).not.toHaveURL(/\/import\//);
	});

	test('a 3MF opens too', async ({ page }) => {
		const { openUrl } = await send(page, 'Plate.3mf', cube3mf(15));
		await page.goto(openUrl);
		await expect(objects(page)).toHaveCount(1);
	});

	test('a zip with one model in it opens that model, and names the design for the zip', async ({ page }) => {
		const zip = deflatedZip({ 'files/Gear.stl': cubeStl(12), 'images/photo.png': Buffer.from([1, 2, 3]), 'README.txt': 'hello' });
		const { openUrl } = await send(page, 'Gear pack.zip', zip);
		await page.goto(openUrl);
		await expect(objects(page)).toHaveCount(1);
		await expect(designName(page)).toHaveValue('Gear pack');
	});

	test('a zip with several models asks which, and opens the ones ticked in a row', async ({ page }) => {
		const zip = deflatedZip({ 'Left.stl': cubeStl(10), 'Right.stl': cubeStl(10), 'Base.3mf': cube3mf(20), 'notes.txt': 'x' });
		const { id, openUrl } = await send(page, 'Bracket kit.zip', zip);
		await page.goto(openUrl);
		await expect(page.getByRole('heading', { name: 'Which models do you want to open?' })).toBeVisible();
		await expect(page.getByRole('checkbox')).toHaveCount(3);
		await expect(page.getByRole('checkbox', { name: 'Left.stl' })).toBeChecked();
		await page.getByRole('checkbox', { name: 'Base.3mf' }).uncheck();
		await expect(page.getByRole('button', { name: 'Open 2 models' })).toBeVisible();
		await page.getByRole('button', { name: 'Open 2 models' }).click();
		await expect(page).toHaveURL(/\/design\//);
		await expect(objects(page)).toHaveCount(2);
		await expect(designName(page)).toHaveValue('Bracket kit');
		expect((await page.request.get(`/api/import/${id}`)).status()).toBe(404);
	});

	test('Select none turns the Open button off, and Select all ticks everything again', async ({ page }) => {
		const zip = deflatedZip({ 'A.stl': cubeStl(10), 'B.stl': cubeStl(10) });
		const { openUrl } = await send(page, 'Two.zip', zip);
		await page.goto(openUrl);
		await page.getByRole('button', { name: 'Select none' }).click();
		await expect(page.getByRole('button', { name: /^Open 0 models/ })).toBeDisabled();
		await page.getByRole('button', { name: 'Select all' }).click();
		await expect(page.getByRole('button', { name: 'Open 2 models' })).toBeEnabled();
	});

	test('a file that is not a model says what can be opened, and a link back', async ({ page }) => {
		const { openUrl } = await send(page, 'notes.txt', Buffer.from('hello'));
		await page.goto(openUrl);
		await expect(page.getByRole('heading', { name: 'This file could not be opened' })).toBeVisible();
		await expect(page.getByText(/STL, OBJ, 3MF or SVG/)).toBeVisible();
		await expect(page.getByRole('link', { name: 'All designs' })).toBeVisible();
	});

	test('a model with nothing in it is named in the message, and no design is made', async ({ page }) => {
		const before = ((await (await page.request.get('/api/designs')).json()) as unknown[]).length;
		const { openUrl } = await send(page, 'Empty.stl', Buffer.alloc(84));
		await page.goto(openUrl);
		await expect(page.getByRole('heading', { name: 'This file could not be opened' })).toBeVisible();
		await expect(page.getByText(/Empty\.stl/)).toBeVisible();
		expect(((await (await page.request.get('/api/designs')).json()) as unknown[]).length).toBe(before);
	});

	test('an address with nothing waiting says so', async ({ page }) => {
		await page.goto(`/import/${'0'.repeat(32)}`);
		await expect(page.getByRole('heading', { name: 'This file could not be opened' })).toBeVisible();
		await expect(page.getByText(/Nothing is waiting there/)).toBeVisible();
	});

	test('the server refuses a file sent without the add-on’s header', async ({ page }) => {
		const res = await page.request.post('/api/import', {
			data: cubeStl(5),
			headers: { 'content-type': TYPE, 'x-file-name': 'a.stl' },
		});
		expect(res.status()).toBe(403);
	});

	test('the choice screen passes the accessibility scan', async ({ page }) => {
		const { openUrl } = await send(page, 'Two.zip', deflatedZip({ 'A.stl': cubeStl(10), 'B.stl': cubeStl(10) }));
		await page.goto(openUrl);
		await expect(page.getByRole('checkbox', { name: 'A.stl' })).toBeVisible();
		const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
		expect(results.violations).toEqual([]);
	});
});

test.describe('big models', () => {
	test('a model of 1.9 million triangles (twice what was once the limit) opens as a design with its detail kept', async ({ page }) => {
		test.setTimeout(120_000);
		// 1000 x 951 gives 1,900,000 triangles: a 95 MB file, the size of a detailed scan or a hollow skeleton model
		const file = sphereStl(1000, 951);
		expect(file.readUInt32LE(80)).toBe(1_900_000);
		const { id, openUrl } = await send(page, 'Detailed sphere.stl', file);
		await page.goto(openUrl);
		await expect(page).toHaveURL(/\/design\/[0-9a-f]{32}$/, { timeout: 90_000 });
		await expect(objects(page)).toHaveCount(1);
		expect((await page.request.get(`/api/import/${id}`)).status()).toBe(404);

		// the stored model has every triangle (a mesh file is 12 bytes, then 12 per corner and 12 per triangle)
		const designId = page.url().split('/').pop();
		const design = (await (await page.request.get(`/api/designs/${designId}`)).json()) as {
			nodes: Record<string, { params: { mesh?: string } }>;
		};
		const ref = Object.values(design.nodes).find((n) => n.params.mesh)?.params.mesh;
		const stored = await page.request.get(`/api/meshes/${ref}`);
		const bytes = await stored.body();
		const triangles = bytes.readUInt32LE(8);
		expect(triangles).toBeLessThanOrEqual(1_900_000);
		expect(triangles).toBeGreaterThan(1_800_000);
	});
});
