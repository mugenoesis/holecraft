import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { newDesign, openPanel, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * The Resin panel: drain and vent holes (ordinary holes, grouped with the shape so they cut) and the tilt buttons. The cut is proved by a
 * real STL export: its volume is the box's less the two round holes, worked out here by hand.
 */

const list = (page: Page) => page.getByTestId('object-list');
const resin = (page: Page) => page.getByRole('region', { name: 'Resin' });

async function exportStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	return parseStl(await readFile(await download.path()));
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
	await page.getByRole('button', { name: 'Box', exact: true }).click(); // a 20 mm box, selected or not
	await openPanel(page, 'Objects');
	await list(page)
		.getByRole('button', { name: /^Box 1 / })
		.click();
	await openPanel(page, 'Edit');
});

test('the panel says what to select when nothing is', async ({ page }) => {
	await page.keyboard.press('Escape');
	await expect(resin(page).getByRole('button', { name: 'Add drain hole' })).toBeDisabled();
	await expect(resin(page).getByRole('button', { name: 'Tilt 30°' })).toBeDisabled();
	await expect(resin(page).getByText('Select one shape or group to add a drain or vent hole to it.')).toBeVisible();
});

test('a drain and a vent hole are added to the box and cut it by their volume', async ({ page }) => {
	await resin(page).getByRole('button', { name: 'Add drain hole' }).click();
	await resin(page).getByRole('button', { name: 'Add vent hole' }).click();
	// both are in the one group the first one made, as ordinary holes
	await openPanel(page, 'Objects');
	await expect(list(page).locator('li')).toHaveCount(1);
	const stl = await exportStl(page);
	const hole = Math.PI * 1.75 ** 2 * 5; // 3.5 mm across, 5 mm inside the box
	// round holes are faceted a little under the true circle
	expect(stl.volume).toBeGreaterThan(8000 - 2 * hole - 1);
	expect(stl.volume).toBeLessThan(8000 - 2 * hole + 1);
});

test('the diameter is the one typed, and undo takes a hole away', async ({ page }) => {
	await resin(page).getByLabel('Diameter').fill('6');
	await resin(page).getByRole('button', { name: 'Add drain hole' }).click();
	await openPanel(page, 'Objects');
	const stl = await exportStl(page);
	const hole = Math.PI * 3 ** 2 * 5;
	expect(stl.volume).toBeGreaterThan(8000 - hole - 2);
	expect(stl.volume).toBeLessThan(8000 - hole + 2);
	await page.keyboard.press('Control+z');
	await expect(list(page).getByRole('button', { name: /^Box 1 / })).toBeVisible();
	expect((await exportStl(page)).volume).toBeCloseTo(8000, 0);
});

test('a diameter a hole cannot be disables the buttons', async ({ page }) => {
	await resin(page).getByLabel('Diameter').fill('0.1');
	await expect(resin(page).getByRole('button', { name: 'Add drain hole' })).toBeDisabled();
	await resin(page).getByLabel('Diameter').fill('3.5');
	await expect(resin(page).getByRole('button', { name: 'Add drain hole' })).toBeEnabled();
});

test('tilting turns the box about X and keeps it on the plane', async ({ page }) => {
	await resin(page).getByRole('button', { name: 'Tilt 45°' }).click();
	await expect(properties(page).getByLabel('Rotate X', { exact: true })).toHaveValue('45');
	const stl = await exportStl(page);
	expect(stl.min[2]).toBeCloseTo(0, 1);
	expect(stl.max[2]).toBeCloseTo(20 * Math.SQRT2, 1); // a cube on its edge
	await resin(page).getByRole('button', { name: 'Tilt 45°' }).click();
	await expect(properties(page).getByLabel('Rotate X', { exact: true })).toHaveValue('90');
});
