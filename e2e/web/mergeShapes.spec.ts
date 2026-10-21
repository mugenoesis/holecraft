import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { addAtOrigin, field, newDesign, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * Merge: the selected shapes (or one group) become one solid, as one undo step. The merged solid is proved by a real STL export: its volume is the
 * volume of the shapes' union, worked out here from the sizes.
 */

const list = (page: Page) => page.getByTestId('object-list');
const row = (page: Page, i: number) => list(page).locator('li').nth(i).locator('button').first();
const merge = (page: Page) => page.getByRole('button', { name: 'Merge', exact: true });

async function setField(page: Page, name: string, value: string) {
	await field(page, name).fill(value);
	await field(page, name).press('Enter');
	await expect(field(page, name)).toHaveValue(value);
}

async function exportStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	return parseStl(await readFile(await download.path()));
}

/** Two 20 mm boxes, the second 10 mm to the right of the first (so they overlap by half), with nothing selected. */
async function twoBoxes(page: Page) {
	await addAtOrigin(page, 'Box');
	await addAtOrigin(page, 'Box');
	await row(page, 1).click();
	await setField(page, 'X', '10');
	await page.getByRole('heading', { name: 'Objects' }).click();
	await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('merging shapes into one solid', () => {
	test('is off while fewer than two shapes are selected, and says what to select', async ({ page }) => {
		await expect(merge(page)).toBeDisabled();
		await addAtOrigin(page, 'Box');
		await row(page, 0).click();
		await expect(merge(page)).toBeDisabled();
		await expect(merge(page)).toHaveAttribute('title', /Select two or more shapes/);
	});

	test('joins two overlapping boxes into one solid of their combined volume, and Undo gives the two boxes back', async ({ page }) => {
		await twoBoxes(page);
		await page.keyboard.press('Control+a');
		await expect(merge(page)).toBeEnabled();
		await merge(page).click();
		await expect(list(page).locator('li')).toHaveCount(1);
		await expect(row(page, 0)).toContainText('merged');
		// 20 x 20 x 20 and the same 10 mm over: 30 x 20 x 20 together
		const stl = await exportStl(page);
		expect(stl.volume).toBeGreaterThan(12_000 - 5);
		expect(stl.volume).toBeLessThan(12_000 + 5);
		expect(stl.min.map((v) => Math.round(v))).toEqual([-10, -10, 0]);
		expect(stl.max.map((v) => Math.round(v))).toEqual([20, 10, 20]);
		await page.keyboard.press('Control+z');
		await expect(list(page).locator('li')).toHaveCount(2);
	});

	test('cuts with a hole that is among the selected shapes', async ({ page }) => {
		await twoBoxes(page);
		await row(page, 1).click();
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+a');
		await merge(page).click();
		await expect(list(page).locator('li')).toHaveCount(1);
		// the first box less the 10 mm it shares with the hole: 10 x 20 x 20
		const stl = await exportStl(page);
		expect(stl.volume).toBeGreaterThan(4_000 - 5);
		expect(stl.volume).toBeLessThan(4_000 + 5);
	});

	test('cannot merge when everything selected is a hole', async ({ page }) => {
		await twoBoxes(page);
		await page.keyboard.press('Control+a');
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await expect(merge(page)).toBeDisabled();
		await expect(merge(page)).toHaveAttribute('title', /at least one solid/);
	});

	test('merges a group that is already made, and leaves the shapes that are not selected', async ({ page }) => {
		await twoBoxes(page);
		await addAtOrigin(page, 'Cylinder');
		await row(page, 2).click();
		await setField(page, 'X', '80');
		await page.keyboard.press('Escape');
		await row(page, 0).click();
		await row(page, 1).click({ modifiers: ['Shift'] });
		await page.getByRole('button', { name: 'Group', exact: true }).click();
		await expect(list(page).locator('li')).toHaveCount(2);
		await list(page)
			.getByRole('button', { name: /^Group 1/ })
			.click();
		await merge(page).click();
		await expect(list(page).locator('li')).toHaveCount(2);
		await expect(list(page).getByRole('button', { name: /merged/ })).toBeVisible();
		await expect(list(page).getByRole('button', { name: /^Cylinder 1/ })).toBeVisible();
	});

	test('the merged solid is an ordinary model: it moves, and its parts are gone from the list', async ({ page }) => {
		await twoBoxes(page);
		await page.keyboard.press('Control+a');
		await merge(page).click();
		await expect(list(page).locator('li')).toHaveCount(1);
		await row(page, 0).click();
		await setField(page, 'X', '50');
		const stl = await exportStl(page);
		expect(stl.volume).toBeGreaterThan(12_000 - 5);
		await expect(list(page).getByRole('button', { name: /^Box \d+ \(/ })).toHaveCount(0); // the parts ("Box 1 (0, 0)"), not "Box 1 merged"
	});
});
