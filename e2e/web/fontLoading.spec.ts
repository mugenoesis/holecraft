import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { field, newDesign } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * Fonts load when a design needs them: the default (Sans) is part of the code, and each of the others is its own file, fetched the first time a
 * design uses it. Proved from the network (which files the page asks for) and from what is exported (the letters come out in the right font).
 */

const tile = (page: Page) => page.getByRole('region', { name: 'Shapes' }).getByRole('button', { name: 'Text', exact: true });
const FONT_FILE = /\/assets\/(serif|mono|script|rounded|condensed|caps|display|handwriting|brush)\.generated-/;

/** The font files the page asks for from now on. */
function watchFonts(page: Page): string[] {
	const asked: string[] = [];
	page.on('request', (r) => {
		const match = FONT_FILE.exec(r.url());
		if (match) asked.push(match[1]!);
	});
	return asked;
}

async function exportStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	return parseStl(await readFile(await download.path()));
}

async function addText(page: Page) {
	await tile(page).press('Enter');
	await page
		.getByTestId('object-list')
		.getByRole('button', { name: /^Text 1 / })
		.click();
}

test.describe('fonts load when a design needs them', () => {
	test('a design with no text, or text in the default font, fetches no other font', async ({ page }) => {
		const asked = watchFonts(page);
		await newDesign(page);
		await addText(page);
		expect((await exportStl(page)).volume).toBeGreaterThan(0);
		expect(asked).toEqual([]);
	});

	test('choosing a font fetches it, once for the page, and the words come out in it', async ({ page }) => {
		await newDesign(page);
		await addText(page);
		const sans = (await exportStl(page)).volume;
		const asked = watchFonts(page);
		await field(page, 'Font').selectOption({ label: 'Script' });
		await expect(field(page, 'Font').locator('option:checked')).toHaveText('Script');
		const script = (await exportStl(page)).volume;
		expect(Math.abs(script - sans)).toBeGreaterThan(1);
		expect(asked.filter((f) => f !== 'script')).toEqual([]);
		expect(asked).toContain('script');
	});

	test('opening a design that uses a font fetches it first, and the shape is the letters, not a placeholder box', async ({ page }) => {
		await newDesign(page);
		await addText(page);
		await field(page, 'Font').selectOption({ label: 'Brush' });
		const before = (await exportStl(page)).volume;
		const id = page.url().split('/').pop();
		await expect.poll(async () => JSON.stringify(await (await page.request.get(`/api/designs/${id}`)).json())).toContain('"font":10');
		const asked = watchFonts(page);
		await page.reload();
		await expect(page.getByTestId('object-list').getByRole('button', { name: /^Text 1 / })).toBeVisible();
		expect(asked).toContain('brush');
		expect(Math.abs((await exportStl(page)).volume - before)).toBeLessThan(0.01);
	});
});
