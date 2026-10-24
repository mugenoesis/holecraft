import { expect, test } from '@playwright/test';
import { center, dropShape, newDesign, viewport } from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('settings cog', () => {
	test('the handle size slider resizes the handles and is remembered', async ({ page }) => {
		await dropShape(page, 'Box');
		const { x, y } = await center(viewport(page));
		await page.mouse.click(x, y);
		const handle = page.getByTestId('handle-height');
		await expect(handle).toBeVisible();
		const before = (await handle.boundingBox())?.width ?? 0;

		await page.getByRole('button', { name: 'Settings' }).click();
		const slider = page.getByRole('slider', { name: 'Handle size' });
		await slider.fill('2');
		await expect.poll(async () => (await handle.boundingBox())?.width ?? 0).toBeGreaterThan(before * 1.7);

		await page.reload();
		const again = await center(viewport(page));
		await page.mouse.click(again.x, again.y);
		await expect.poll(async () => (await page.getByTestId('handle-height').boundingBox())?.width ?? 0).toBeGreaterThan(before * 1.7);
	});

	test('starts at 50% and runs from 10% to 200%', async ({ page }) => {
		await page.getByRole('button', { name: 'Settings' }).click();
		const slider = page.getByRole('slider', { name: 'Handle size' });
		await expect(slider).toHaveValue('0.5');
		await expect(slider).toHaveAttribute('min', '0.1');
		await expect(slider).toHaveAttribute('max', '2');
		await expect(page.getByText('Handle size (50%)')).toBeVisible();
	});

	test('Escape closes the panel', async ({ page }) => {
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByRole('slider', { name: 'Handle size' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('slider', { name: 'Handle size' })).toHaveCount(0);
	});
});
