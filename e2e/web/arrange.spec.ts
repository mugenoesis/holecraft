import { expect, type Page, test } from '@playwright/test';
import { dropShape, field, newDesign } from './helpers.ts';

const arrange = (page: Page) => page.getByRole('region', { name: 'Arrange' });
const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i);

/** The X field of the object in list row `i`. */
async function xOf(page: Page, i: number): Promise<number> {
	await row(page, i).click();
	return Number(await field(page, 'X').inputValue());
}

/** A box at the origin and a sphere 200 px to its right, both selected. */
async function twoSelected(page: Page) {
	await dropShape(page, 'Box');
	await dropShape(page, 'Sphere', 200, 0);
	await page.keyboard.press('Control+a');
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('arrange panel', () => {
	test('Align needs two objects, Flip needs one', async ({ page }) => {
		await expect(arrange(page).getByRole('button', { name: 'Align X left edges' })).toBeDisabled();
		await expect(arrange(page).getByRole('button', { name: 'Flip X' })).toBeDisabled();
		await dropShape(page, 'Box');
		await row(page, 0).click();
		await expect(arrange(page).getByRole('button', { name: 'Flip X' })).toBeEnabled();
		await expect(arrange(page).getByRole('button', { name: 'Align X left edges' })).toBeDisabled();
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await expect(arrange(page).getByRole('button', { name: 'Align X left edges' })).toBeEnabled();
	});

	test('aligning X puts both objects on the same spot, and undo brings them back', async ({ page }) => {
		await twoSelected(page);
		const before = [await xOf(page, 0), await xOf(page, 1)];
		expect(before[0]).not.toBe(before[1]);
		await page.keyboard.press('Control+a');
		await arrange(page).getByRole('button', { name: 'Align X centres' }).click();
		await expect.poll(async () => (await xOf(page, 0)) - (await xOf(page, 1))).toBeCloseTo(0, 3);
		await page.keyboard.press('Control+z');
		await expect.poll(async () => await xOf(page, 1)).toBeCloseTo(before[1]!, 3);
	});

	test('flipping X swaps two objects left to right', async ({ page }) => {
		await twoSelected(page);
		const before = [await xOf(page, 0), await xOf(page, 1)];
		await page.keyboard.press('Control+a');
		await arrange(page).getByRole('button', { name: 'Flip X' }).click();
		await expect.poll(async () => await xOf(page, 0)).toBeCloseTo(before[1]!, 3);
		expect(await xOf(page, 1)).toBeCloseTo(before[0]!, 3);
	});
});
