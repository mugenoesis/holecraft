import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { addAtOrigin, field, newDesign, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * Going through the workplane: a shape may be lifted (by its handle or its Z field) so that part of it is underground. Exporting then asks
 * whether to cut that part off at the workplane or keep it as it is, and a hole never decides how high a group is.
 */

const list = (page: Page) => page.getByTestId('object-list');
const row = (page: Page, i: number) => list(page).locator('li').nth(i).locator('button').first();
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Part of the design is below the workplane' });

async function setField(page: Page, name: string, value: string) {
	await field(page, name).fill(value);
	await field(page, name).press('Enter');
	await expect(field(page, name)).toHaveValue(value);
}

/** One 20 mm box (8000 mm3), selected, with its base `z` mm above the workplane. */
async function boxAtHeight(page: Page, z: string) {
	await addAtOrigin(page, 'Box');
	await row(page, 0).click();
	await setField(page, 'Z', z);
}

const stlItem = (page: Page) => page.getByRole('menuitem', { name: /as STL$/ });

async function chooseStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await stlItem(page).click();
}

async function exportStlAnswering(page: Page, answer: string) {
	const download = page.waitForEvent('download', { timeout: 30_000 });
	await chooseStl(page);
	await expect(dialog(page)).toBeVisible();
	await dialog(page).getByRole('button', { name: answer, exact: true }).click();
	return parseStl(await readFile(await (await download).path()));
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('lifting a shape through the workplane', () => {
	test('the Z field takes a height below the workplane', async ({ page }) => {
		await boxAtHeight(page, '-5');
		await expect(field(page, 'Z')).toHaveValue('-5');
	});

	test('the lift handle can be dragged down past the workplane', async ({ page }) => {
		await boxAtHeight(page, '0');
		const lift = page.getByTestId('handle-lift');
		const box = (await lift.boundingBox())!;
		const view = (await page.getByTestId('viewport').boundingBox())!;
		const x = box.x + box.width / 2;
		let y = box.y + box.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		for (let i = 0; i < 12; i++) {
			y += 10;
			await page.mouse.move(x, Math.min(y, view.y + view.height - 5));
		}
		await page.mouse.up();
		await expect.poll(async () => Number(await field(page, 'Z').inputValue())).toBeLessThan(0);
	});
});

test.describe('exporting a shape that is partly underground', () => {
	test('asks, and "Cut off at the workplane" leaves a flat bottom and only what was above it', async ({ page }) => {
		await boxAtHeight(page, '-5');
		const stl = await exportStlAnswering(page, 'Cut off at the workplane');
		expect(stl.volume).toBeGreaterThan(20 * 20 * 15 - 5);
		expect(stl.volume).toBeLessThan(20 * 20 * 15 + 5);
		expect(Math.round(stl.min[2]!)).toBe(0);
		expect(Math.round(stl.max[2]!)).toBe(15);
	});

	test('"Export as it is" keeps the whole shape where it is, below the workplane too', async ({ page }) => {
		await boxAtHeight(page, '-5');
		const stl = await exportStlAnswering(page, 'Export as it is');
		expect(stl.volume).toBeGreaterThan(8000 - 5);
		expect(stl.volume).toBeLessThan(8000 + 5);
		expect(Math.round(stl.min[2]!)).toBe(-5);
	});

	test('Cancel, and Escape, export nothing and say nothing is wrong', async ({ page }) => {
		await boxAtHeight(page, '-5');
		let downloads = 0;
		page.on('download', () => downloads++);
		await chooseStl(page);
		await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(dialog(page)).toBeHidden();
		await chooseStl(page);
		await expect(dialog(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toBeHidden();
		await expect(page.getByRole('alert')).toHaveCount(0);
		expect(downloads).toBe(0);
	});

	test('asks nothing for a shape that is on or above the workplane', async ({ page }) => {
		await boxAtHeight(page, '0');
		const download = page.waitForEvent('download', { timeout: 30_000 });
		await chooseStl(page);
		await download;
		await expect(dialog(page)).toBeHidden();
	});

	test('the question passes the accessibility scan', async ({ page }) => {
		await boxAtHeight(page, '-5');
		await chooseStl(page);
		await expect(dialog(page)).toBeVisible();
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
		expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
	});
});

test.describe('a hole does not give a group height or a place', () => {
	test('a hole cube under a solid cube: the group is 20 high, 20 up, and so is the merged solid', async ({ page }) => {
		await addAtOrigin(page, 'Box');
		await addAtOrigin(page, 'Box');
		await row(page, 0).click();
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await row(page, 1).click();
		await setField(page, 'Z', '20');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Escape');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+g');
		await expect(field(page, 'Height')).toHaveValue('20');
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Merge', exact: true }).click();
		await expect(row(page, 0)).toContainText('merged');
		await row(page, 0).click();
		await expect(field(page, 'Height')).toHaveValue('20');
		await expect(field(page, 'Z')).toHaveValue('20');
	});
});
