import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { addAtOrigin, field, newDesign } from './helpers.ts';
import { cubeStl } from './modelFiles.ts';

/*
 * The Model check: an imported model is checked for the faults that stop it being cut or merged (holes in its surface, triangles facing the
 * wrong way, triangles with no area), and one button mends the usual ones. A cube with a triangle missing is the broken model.
 */

const list = (page: Page) => page.getByTestId('object-list');
const row = (page: Page, i: number) => list(page).locator('li').nth(i).locator('button').first();
const check = (page: Page) => page.getByRole('region', { name: 'Model check' });
const repair = (page: Page) => check(page).getByRole('button', { name: 'Repair' });

async function importFile(page: Page, name: string, buffer: Buffer) {
	await page.getByTestId('import-file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
	await expect(list(page).locator('li')).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('the model check', () => {
	test('is only there for an imported model', async ({ page }) => {
		await addAtOrigin(page, 'Box');
		await row(page, 0).click();
		await expect(check(page)).toHaveCount(0);
	});

	test('says a closed model is closed, and offers no repair', async ({ page }) => {
		await importFile(page, 'closed.stl', cubeStl(20));
		await row(page, 0).click();
		await expect(check(page)).toContainText('Closed surface');
		await expect(repair(page)).toHaveCount(0);
	});

	test('says what is wrong with a model that has a hole, and mends it with one button', async ({ page }) => {
		await importFile(page, 'holey.stl', cubeStl(20, 1));
		await row(page, 0).click();
		await expect(check(page)).toContainText('3 open edges');
		await repair(page).click();
		await expect(check(page)).toContainText('Closed surface');
		await expect(check(page)).toContainText('filled 1 hole');
		await expect(repair(page)).toHaveCount(0);
	});

	test('Undo puts the broken model back, and the check says so again', async ({ page }) => {
		await importFile(page, 'holey.stl', cubeStl(20, 1));
		await row(page, 0).click();
		await repair(page).click();
		await expect(check(page)).toContainText('Closed surface');
		await page.keyboard.press('Control+z');
		await expect(check(page)).toContainText('3 open edges');
	});

	test('a model with a hole cannot be merged, and can once it is repaired', async ({ page }) => {
		await importFile(page, 'holey.stl', cubeStl(20, 1));
		await addAtOrigin(page, 'Box');
		await row(page, 1).click();
		await field(page, 'X').fill('10');
		await field(page, 'X').press('Enter');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Merge', exact: true }).click();
		await expect(page.getByRole('alert').filter({ hasText: /watertight/ })).toBeVisible();
		await expect(list(page).locator('li')).toHaveCount(2);

		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Escape');
		await row(page, 0).click();
		await repair(page).click();
		await expect(check(page)).toContainText('Closed surface');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Merge', exact: true }).click();
		await expect(list(page).locator('li')).toHaveCount(1);
	});

	test('has no WCAG A or AA problems (axe), with a fault shown and after the repair', async ({ page }) => {
		await importFile(page, 'holey.stl', cubeStl(20, 1));
		await row(page, 0).click();
		await expect(check(page)).toContainText('3 open edges');
		const scan = async () =>
			(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(
				(v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
			);
		expect(await scan()).toEqual([]);
		await repair(page).click();
		await expect(check(page)).toContainText('filled 1 hole');
		expect(await scan()).toEqual([]);
	});
});
