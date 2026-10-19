import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { dropShape, field, newDesign, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * Countersunk holes: a cylinder set to Hole can flare its entrance. The fields appear only for cylinder holes, and a real
 * export proves the flare is cut: the volume left is worked out here by hand (not copied from the app).
 */

const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();
const ends = (page: Page) => properties(page).getByRole('group', { name: 'Countersink end' });
const setType = (page: Page, mode: 'Solid' | 'Hole') => properties(page).getByRole('button', { name: mode, exact: true }).click();

async function setCountersink(page: Page, size: number) {
	await field(page, 'Countersink').fill(String(size));
	await field(page, 'Countersink').press('Enter');
	await expect(field(page, 'Countersink')).toHaveValue(String(size));
}

async function setField(page: Page, name: string, value: string) {
	await field(page, name).fill(value);
	await field(page, name).press('Enter');
	await expect(field(page, name)).toHaveValue(value);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('countersink', () => {
	test('only a cylinder set to Hole has a Countersink field', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Cylinder', 150, 0);
		await dropShape(page, 'Sphere', -150, 0);
		for (const i of [0, 1, 2]) {
			await row(page, i).click();
			await setType(page, 'Hole');
			await expect(field(page, 'Countersink')).toHaveCount(i === 1 ? 1 : 0);
		}
		await row(page, 1).click();
		await setType(page, 'Solid');
		await expect(field(page, 'Countersink')).toHaveCount(0);
	});

	test('the end choice appears once there is a countersink (Top first), and one too big for the hole says so', async ({ page }) => {
		await dropShape(page, 'Cylinder');
		await row(page, 0).click();
		await setType(page, 'Hole');
		await expect(ends(page)).toHaveCount(0);
		await setCountersink(page, 3);
		await expect(ends(page).getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');
		await ends(page).getByRole('button', { name: 'Both' }).click();
		await expect(ends(page).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('countersink-limited')).toHaveCount(0);
		await setCountersink(page, 50); // the hole is 20 mm tall, so 10 mm of flare at each end
		await expect(page.getByTestId('countersink-limited')).toContainText('Limited to 10 mm');
		await setCountersink(page, 0);
		await expect(ends(page)).toHaveCount(0);
	});

	test('a chamfer typed on the hole says it is not used while there is a countersink', async ({ page }) => {
		await dropShape(page, 'Cylinder');
		await row(page, 0).click();
		await setType(page, 'Hole');
		await setField(page, 'Chamfer', '2');
		await expect(page.getByTestId('chamfer-ignored')).toHaveCount(0);
		await setCountersink(page, 3);
		await expect(page.getByTestId('chamfer-ignored')).toContainText('countersink');
	});

	test('the exported block loses the hole and its flare (volume worked out by hand)', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter'); // 20 mm cube at the origin
		await page.getByRole('button', { name: 'Cylinder', exact: true }).press('Enter');
		await row(page, 1).click();
		await setField(page, 'Width', '6');
		await setField(page, 'Depth', '6');
		await setType(page, 'Hole');
		await setCountersink(page, 3); // the hole is 20 mm tall, flush with the cube's top
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();

		const exportStl = async () => {
			await page.getByRole('button', { name: 'Export', exact: true }).click();
			const [download] = await Promise.all([
				page.waitForEvent('download', { timeout: 30_000 }),
				page.getByRole('menuitem', { name: /as STL$/ }).click(),
			]);
			return parseStl(await readFile(await download.path()));
		};
		// 64-sided cylinders (the app's own facet count is part of the shape): area of a regular polygon, and the flare integral
		const N = 64;
		const k = (N / 2) * Math.sin((2 * Math.PI) / N);
		const hole = k * 3 * 3 * 20;
		const flare = k * (3 * 3 * 3 + 3 * 3 * 3 + 27 / 3) - k * 9 * 3; // integral of (3 + t)^2 over 0..3, minus the plain hole's share
		const stl = await exportStl();
		expect(stl.volume).toBeCloseTo(8000 - hole - flare, 1);
	});
});
