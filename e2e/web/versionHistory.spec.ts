import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { addAtOrigin, newDesign } from './helpers.ts';

/*
 * Version history: the server keeps how a design stood before each stretch of editing, and the editor can put one back. Restoring keeps what
 * was there, so it is never a one-way step.
 */

const button = (page: Page) => page.getByRole('button', { name: 'Version history' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Version history' });
const rows = (page: Page) => dialog(page).locator('li');
const shapes = (page: Page) => page.getByTestId('object-list').locator('li');

/** Waits until the server has the design with this many shapes (the top bar says "Saved" before a change is even noticed, so it cannot be trusted alone). */
async function savedWith(page: Page, count: number) {
	const id = page.url().split('/').pop();
	await expect
		.poll(async () => ((await (await page.request.get(`/api/designs/${id}`)).json()) as { roots: string[] }).roots.length)
		.toBe(count);
}

/** A design with one box in it, saved: its history holds the empty design it was before. */
async function oneBox(page: Page) {
	await newDesign(page);
	await addAtOrigin(page, 'Box');
	await savedWith(page, 1);
}

test.describe('version history', () => {
	test('lists how the design stood before it was edited, with what was in it', async ({ page }) => {
		await oneBox(page);
		await button(page).click();
		await expect(dialog(page)).toBeVisible();
		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page).first()).toContainText('empty');
		await expect(rows(page).first()).toContainText('Today');
	});

	test('restoring an earlier version puts it back, after a reload too', async ({ page }) => {
		await oneBox(page);
		await button(page).click();
		await rows(page)
			.first()
			.getByRole('button', { name: /Restore/ })
			.click();
		await expect(shapes(page)).toHaveCount(0);
		await savedWith(page, 0);
		await page.reload();
		await expect(shapes(page)).toHaveCount(0);
	});

	test('keeps what was there, so a restore can be taken back', async ({ page }) => {
		await oneBox(page);
		await button(page).click();
		await rows(page)
			.first()
			.getByRole('button', { name: /Restore/ })
			.click();
		await expect(shapes(page)).toHaveCount(0);
		await button(page).click();
		await expect(rows(page)).toHaveCount(2);
		await expect(rows(page).first()).toContainText('1 object');
		await rows(page)
			.first()
			.getByRole('button', { name: /Restore/ })
			.click();
		await expect(shapes(page)).toHaveCount(1);
		await savedWith(page, 1);
	});

	test('saves what is still waiting before it lists, so the latest edit is not lost by a restore', async ({ page }) => {
		await newDesign(page);
		await addAtOrigin(page, 'Box');
		await savedWith(page, 1);
		await addAtOrigin(page, 'Sphere');
		await button(page).click();
		await expect(rows(page).first()).toBeVisible();
		await dialog(page).getByRole('button', { name: 'Close' }).click();
		await savedWith(page, 2);
	});

	test('Escape and Close shut it, and focus goes back to the button', async ({ page }) => {
		await oneBox(page);
		await button(page).click();
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toBeHidden();
		await expect(button(page)).toBeFocused();
		await button(page).click();
		await dialog(page).getByRole('button', { name: 'Close' }).click();
		await expect(dialog(page)).toBeHidden();
	});

	test('says so when nothing has been kept yet', async ({ page }) => {
		await newDesign(page);
		await button(page).click();
		await expect(dialog(page)).toContainText('Nothing kept yet');
	});

	test('passes the accessibility scan', async ({ page }) => {
		await oneBox(page);
		await button(page).click();
		await expect(rows(page)).toHaveCount(1);
		const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
		expect(results.violations).toEqual([]);
	});
});
