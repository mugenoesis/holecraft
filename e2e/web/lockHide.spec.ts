import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { center, dropShape, field, newDesign, selectedNames, viewport } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

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

/*
 * Hide and lock for what is inside a group: a group row opens (it starts closed) to list what it holds, each with its own eye and padlock.
 * A hidden part of a group is left out of what the group is worked out as, and out of the export.
 */
test.describe('hide and lock inside a group', () => {
	const open = (page: Page) => row(page, 0).getByRole('button', { name: 'Show contents' });
	const child = (page: Page, name: string) => row(page, 0).locator('li').filter({ hasText: name });
	const childToggle = (page: Page, name: string, label: RegExp) => child(page, name).getByRole('button', { name: label });

	async function exportedVolume(page: Page) {
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 30_000 }),
			page.getByRole('menuitem', { name: /as STL$/ }).click(),
		]);
		return parseStl(await readFile(await download.path())).volume;
	}

	test.beforeEach(async ({ page }) => {
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();
	});

	test('a group row starts closed, opens to list what it holds, and closes again; a plain shape has nothing to open', async ({ page }) => {
		await expect(row(page, 0).locator('li')).toHaveCount(0);
		await open(page).click();
		await expect(row(page, 0).locator('li')).toHaveCount(2);
		await expect(child(page, 'Box 1')).toBeVisible();
		await expect(child(page, 'Sphere 1')).toBeVisible();
		await row(page, 0).getByRole('button', { name: 'Hide contents' }).click();
		await expect(row(page, 0).locator('li')).toHaveCount(0);
		await dropShape(page, 'Cylinder', 0, 150);
		await expect(page.getByTestId('object-list').getByRole('button', { name: 'Show contents' })).toHaveCount(1);
	});

	test('hiding a part leaves it out of the export, and showing it puts it back', async ({ page }) => {
		const both = await exportedVolume(page);
		await open(page).click();
		await childToggle(page, 'Box 1', /^Hide/).click();
		await expect(child(page, 'Box 1')).toHaveAttribute('data-hidden', 'true');
		await expect(row(page, 0)).toHaveAttribute('data-hidden', 'false');
		const sphereOnly = await exportedVolume(page);
		expect(sphereOnly).toBeLessThan(both * 0.5);
		expect(sphereOnly).toBeGreaterThan(4000); // a 20 mm sphere
		await page.getByRole('button', { name: 'Show all' }).click();
		await expect(child(page, 'Box 1')).toHaveAttribute('data-hidden', 'false');
		expect(await exportedVolume(page)).toBeCloseTo(both, 3);
	});

	test('hidden and locked parts survive a reload, and clicking a part’s name selects its group', async ({ page }) => {
		await open(page).click();
		await childToggle(page, 'Sphere 1', /^Lock/).click();
		await childToggle(page, 'Sphere 1', /^Hide/).click();
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await open(page).click();
		await expect(child(page, 'Sphere 1')).toHaveAttribute('data-hidden', 'true');
		await expect(child(page, 'Sphere 1')).toHaveAttribute('data-locked', 'true');
		await child(page, 'Box 1').locator('button').first().click();
		expect(await selectedNames(page)).toEqual(['Group 1']);
	});
});
