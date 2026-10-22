import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, newDesign, selectView, viewport } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * Editing an engraving: the engraving remembers its words, font, size, turn, depth and where it was placed, and Edit engraving (in the
 * properties of the group it is in) goes back into the Engrave tool with them. Done fits the lettering again in place of the old one. Proved from
 * real STL exports (the volume the lettering takes out or adds), and across a reload and a move.
 */

const tool = (page: Page) => page.getByRole('button', { name: 'Engrave', exact: true }).first();
const bar = (page: Page) => page.getByTestId('engrave-bar');
const edit = (page: Page) => page.getByRole('button', { name: 'Edit engraving' });
const done = (page: Page) => bar(page).getByRole('button', { name: 'Done' });

async function volume(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	return parseStl(await readFile(await download.path())).volume;
}

async function fill(page: Page, label: string, value: string) {
	await bar(page).getByLabel(label, { exact: true }).fill(value);
}

/** A 20 mm box (8000 mm3) with the word given engraved in its top, one millimetre deep: the group is selected afterwards. */
async function engraved(page: Page, words = 'I', size = '6', depth = '1') {
	await dropShape(page, 'Box');
	await selectView(page, 'Top');
	await cameraSettled(page);
	await tool(page).click();
	const { x, y } = await center(viewport(page));
	await page.mouse.click(x, y);
	await expect(bar(page)).toBeVisible();
	await fill(page, 'Words', words);
	await fill(page, 'Letter size', size);
	await fill(page, 'Depth', depth);
	await done(page).click();
	await expect(bar(page)).toBeHidden({ timeout: 20_000 });
}

/** The engraving's depth and size, then Done, and wait for the tool to close. */
async function reengrave(page: Page, patch: Record<string, string>) {
	await edit(page).click();
	await expect(bar(page)).toBeVisible();
	for (const [label, value] of Object.entries(patch)) await fill(page, label, value);
	await done(page).click();
	await expect(bar(page)).toBeHidden({ timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
	// fitting lettering takes the geometry engine a few seconds on a slow runner, and most of these do it twice (and one reloads the page)
	test.setTimeout(60_000);
	await newDesign(page);
});

test.describe('editing an engraving', () => {
	test('opens the Engrave tool with the words, size and depth it was made with', async ({ page }) => {
		await engraved(page, 'Hello', '5', '0.8');
		await edit(page).click();
		await expect(bar(page)).toBeVisible();
		await expect(bar(page).getByLabel('Words', { exact: true })).toHaveValue('Hello');
		await expect(bar(page).getByLabel('Letter size', { exact: true })).toHaveValue('5');
		await expect(bar(page).getByLabel('Depth', { exact: true })).toHaveValue('0.8');
	});

	test('a deeper cut takes out more: the old engraving is replaced, not added to', async ({ page }) => {
		await engraved(page);
		const shallow = 8000 - (await volume(page));
		expect(shallow).toBeGreaterThan(1);
		await reengrave(page, { Depth: '3' });
		const deep = 8000 - (await volume(page));
		expect(deep / shallow).toBeGreaterThan(2.7);
		expect(deep / shallow).toBeLessThan(3.3);
		await expect(page.getByTestId('object-list').locator('li')).toHaveCount(1);
	});

	test('raised lettering instead adds to the shape', async ({ page }) => {
		await engraved(page);
		await edit(page).click();
		await bar(page).getByRole('button', { name: 'Raised' }).click();
		await done(page).click();
		await expect(bar(page)).toBeHidden({ timeout: 20_000 });
		expect(await volume(page)).toBeGreaterThan(8000 + 1);
	});

	test('is one undo step, and undo brings the earlier engraving back', async ({ page }) => {
		await engraved(page);
		const before = await volume(page);
		await reengrave(page, { Depth: '3' });
		expect(await volume(page)).toBeLessThan(before - 1);
		await page.keyboard.press('Control+z');
		await expect.poll(async () => Math.abs((await volume(page)) - before), { timeout: 20_000 }).toBeLessThan(0.5);
	});

	test('Cancel leaves the engraving as it was', async ({ page }) => {
		await engraved(page);
		const before = await volume(page);
		await edit(page).click();
		await fill(page, 'Depth', '5');
		await bar(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(bar(page)).toBeHidden();
		expect(Math.abs((await volume(page)) - before)).toBeLessThan(0.5);
	});

	test('is remembered with the design: after a reload it opens with the same words', async ({ page }) => {
		await engraved(page, 'Saved', '4', '0.6');
		const id = page.url().split('/').pop();
		await expect
			.poll(async () => JSON.stringify(await (await page.request.get(`/api/designs/${id}`)).json()))
			.toContain('"engText":"Saved"');
		await page.reload();
		await page
			.getByTestId('object-list')
			.getByText(/^Group/)
			.first()
			.click();
		await edit(page).click();
		await expect(bar(page).getByLabel('Words', { exact: true })).toHaveValue('Saved');
		await expect(bar(page).getByLabel('Depth', { exact: true })).toHaveValue('0.6');
	});

	test('still lands on the face after the group has been moved', async ({ page }) => {
		await engraved(page);
		const first = 8000 - (await volume(page));
		const { x, y } = await center(viewport(page));
		await page.keyboard.press('Escape');
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 60, y + 40, { steps: 8 });
		await page.mouse.up();
		await page
			.getByTestId('object-list')
			.getByText(/^Group/)
			.first()
			.click();
		await reengrave(page, { Depth: '2' });
		const second = 8000 - (await volume(page));
		expect(second / first).toBeGreaterThan(1.8);
		expect(second / first).toBeLessThan(2.2);
	});
});
