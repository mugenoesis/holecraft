import { expect, type Page, test } from '@playwright/test';
import { center, dropShape, field, newDesign, selectedNames, viewport } from './helpers.ts';

const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i);
const toggle = (page: Page, i: number, name: RegExp) => row(page, i).getByRole('button', { name });

test.beforeEach(async ({ page }) => {
	await newDesign(page);
	await dropShape(page, 'Box');
});

test.describe('hide and lock', () => {
	test('hiding an object deselects it, and clicking where it was does not bring it back', async ({ page }) => {
		await page.keyboard.press('Control+a');
		expect(await selectedNames(page)).toEqual(['Box 1']);
		await toggle(page, 0, /^Hide/).click();
		await expect(row(page, 0)).toHaveAttribute('data-hidden', 'true');
		expect(await selectedNames(page)).toEqual([]);
		const { x, y } = await center(viewport(page));
		await page.mouse.click(x, y);
		expect(await selectedNames(page)).toEqual([]);
		await page.keyboard.press('Control+a');
		expect(await selectedNames(page)).toEqual([]);
	});

	test('Show all brings every hidden object back, and only appears when something is hidden', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(0);
		await toggle(page, 0, /^Hide/).click();
		await page.getByRole('button', { name: 'Show all' }).click();
		await expect(row(page, 0)).toHaveAttribute('data-hidden', 'false');
		await expect(page.getByRole('button', { name: 'Show all' })).toHaveCount(0);
		await page.keyboard.press('Control+a');
		expect(await selectedNames(page)).toEqual(['Box 1']);
	});

	test('a locked object cannot be moved, but can be selected and unlocked', async ({ page }) => {
		await row(page, 0).locator('button').first().click();
		const x = await field(page, 'X').inputValue();
		await toggle(page, 0, /^Lock/).click();
		await expect(row(page, 0)).toHaveAttribute('data-locked', 'true');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await expect(field(page, 'X')).toHaveValue(x);
		await toggle(page, 0, /^Unlock/).click();
		await page.keyboard.press('ArrowRight');
		await expect.poll(async () => await field(page, 'X').inputValue()).not.toBe(x);
	});

	test('hidden and locked survive a reload', async ({ page }) => {
		await toggle(page, 0, /^Lock/).click();
		await toggle(page, 0, /^Hide/).click();
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await expect(row(page, 0)).toHaveAttribute('data-hidden', 'true');
		await expect(row(page, 0)).toHaveAttribute('data-locked', 'true');
	});
});
