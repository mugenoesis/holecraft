import { expect, test } from '@playwright/test';
import { dropShape, field, newDesign } from './helpers.ts';

test('Ctrl+D after moving a copy repeats the same step', async ({ page }) => {
	await newDesign(page);
	await dropShape(page, 'Box');
	await page.keyboard.press('Control+a');
	await page.keyboard.press('Control+d'); // the copy lands 10 mm along X and Y
	const x0 = Number(await field(page, 'X').inputValue());
	await page.keyboard.press('ArrowRight');
	await expect.poll(async () => Number(await field(page, 'X').inputValue())).toBeGreaterThan(x0);
	const x1 = Number(await field(page, 'X').inputValue());

	await page.keyboard.press('Control+d');
	await expect(page.getByText('Objects: 3')).toBeVisible();
	const step = x1 - (x0 - 10); // from the original (at x0 - 10) to the moved copy
	await expect.poll(async () => Number(await field(page, 'X').inputValue())).toBeCloseTo(x1 + step, 2);

	await page.keyboard.press('Control+d');
	await expect(page.getByText('Objects: 4')).toBeVisible();
	await expect.poll(async () => Number(await field(page, 'X').inputValue())).toBeCloseTo(x1 + 2 * step, 2);
});
