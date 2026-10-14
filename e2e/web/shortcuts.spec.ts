import { expect, test } from '@playwright/test';
import { newDesign, viewport } from './helpers.ts';

test.describe('the keyboard shortcut sheet', () => {
	test('? opens it and Escape closes it', async ({ page }) => {
		await newDesign(page);
		await page.keyboard.press('?');
		const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByText('Drop to the workplane')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
	});

	test('the ? button in the top bar opens it and Close shuts it', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
		const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(sheet).toBeVisible();
		await sheet.getByRole('button', { name: 'Close' }).click();
		await expect(sheet).toBeHidden();
	});

	test('a click outside it shuts it; typing ? in the design name does not open it', async ({ page }) => {
		await newDesign(page);
		await page.getByLabel('Design name').fill('What?');
		await expect(page.getByRole('dialog')).toBeHidden();
		await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
		await page.mouse.click(5, 5);
		await expect(page.getByRole('dialog')).toBeHidden();
		await expect(viewport(page).locator('canvas')).toBeVisible();
	});

	test('fits a phone screen: it scrolls inside the window and Close stays reachable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 700 });
		await newDesign(page);
		await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
		const box = await page.getByRole('dialog').boundingBox();
		expect(box?.width).toBeLessThanOrEqual(390);
		expect(box?.height).toBeLessThanOrEqual(700);
		await expect(page.getByRole('button', { name: 'Close' })).toBeInViewport();
	});
});
