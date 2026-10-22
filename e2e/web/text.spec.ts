import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { field, newDesign, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * The Text shape: a tile adds the words "Text", Properties has a Text box and a Font choice, and what is exported is the letters themselves
 * (checked from a real STL: its size is the shape's Width, Depth and Height, and different words or a different font are different solids).
 */

const tile = (page: Page) => page.getByRole('region', { name: 'Shapes' }).getByRole('button', { name: 'Text', exact: true });
const names = (page: Page) => page.getByTestId('object-list').getByRole('button', { name: /^Text 1 / });

async function exportStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	return parseStl(await readFile(await download.path()));
}

async function setText(page: Page, words: string) {
	await field(page, 'Text').fill(words);
	await field(page, 'Text').press('Enter');
	await expect(field(page, 'Text')).toHaveValue(words);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
	await tile(page).press('Enter');
	await names(page).click();
});

test.describe('a Text shape', () => {
	test('starts as the words Text in the Sans font, 3 mm thick', async ({ page }) => {
		await expect(field(page, 'Text')).toHaveValue('Text');
		await expect(field(page, 'Font')).toHaveValue('1');
		await expect(field(page, 'Height')).toHaveValue('3');
		await expect(properties(page).getByLabel('Width', { exact: true })).not.toHaveValue('0');
	});

	test('exports as its letters: the file is as big as the Width, Depth and Height fields say, 3 mm thick', async ({ page }) => {
		const width = Number(await field(page, 'Width').inputValue());
		const depth = Number(await field(page, 'Depth').inputValue());
		const stl = await exportStl(page);
		expect(stl.max[0]! - stl.min[0]!).toBeCloseTo(width, 1);
		expect(stl.max[1]! - stl.min[1]!).toBeCloseTo(depth, 1);
		expect(stl.min[2]).toBeCloseTo(0, 3);
		expect(stl.max[2]).toBeCloseTo(3, 3);
		expect(stl.volume).toBeGreaterThan(0);
	});

	test('changing the words rebuilds the letters: longer words are wider and have more material, and one undo brings the old ones back', async ({
		page,
	}) => {
		const before = await exportStl(page);
		await setText(page, 'Holecraft');
		const after = await exportStl(page);
		expect(after.max[0]! - after.min[0]!).toBeGreaterThan((before.max[0]! - before.min[0]!) * 2);
		expect(after.volume).toBeGreaterThan(before.volume * 2);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(field(page, 'Text')).toHaveValue('Text');
		expect((await exportStl(page)).volume).toBeCloseTo(before.volume, 3);
	});

	test('changing the font gives different letters (a different amount of material) and keeps the words', async ({ page }) => {
		const sans = await exportStl(page);
		await field(page, 'Font').selectOption({ label: 'Mono' });
		await expect(field(page, 'Text')).toHaveValue('Text');
		const mono = await exportStl(page);
		expect(Math.abs(mono.volume - sans.volume)).toBeGreaterThan(1);
	});

	test('the added fonts each give their own letters, and are kept when the page is reloaded', async ({ page }) => {
		const volumes = new Set<number>();
		for (const label of ['Rounded', 'Condensed', 'Caps', 'Display', 'Handwriting', 'Brush']) {
			await field(page, 'Font').selectOption({ label });
			await expect(field(page, 'Text')).toHaveValue('Text');
			const stl = await exportStl(page);
			expect(stl.volume, label).toBeGreaterThan(1);
			volumes.add(Math.round(stl.volume));
		}
		expect(volumes.size).toBe(6);
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();
		await page.reload();
		await names(page).click();
		await expect(field(page, 'Font').locator('option:checked')).toHaveText('Brush');
	});

	test('keeps its words when the page is reloaded', async ({ page }) => {
		await setText(page, 'Hello');
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();
		await page.reload();
		await names(page).click();
		await expect(field(page, 'Text')).toHaveValue('Hello');
	});

	test('words with nothing to draw are refused: the box goes back to the old words', async ({ page }) => {
		await field(page, 'Text').fill('   ');
		await field(page, 'Text').press('Enter');
		await expect(field(page, 'Text')).toHaveValue('Text');
	});
});

test.describe('text wrapped round a cylinder', () => {
	async function setWrap(page: Page, radius: string) {
		await field(page, 'Wrap radius').fill(radius);
		await field(page, 'Wrap radius').press('Enter');
		await expect(field(page, 'Wrap radius')).toHaveValue(radius);
	}

	test('bends the letters round the cylinder: its width is the chord of the outer surface, and it still rests on the workplane', async ({
		page,
	}) => {
		const flat = await exportStl(page);
		await setWrap(page, '20');
		// the ends of an outside curve dip, so the text is lifted to keep resting: nothing is below the workplane, so nothing is asked
		const bent = await exportStl(page);
		// the line is as long as it was (W), laid along a cylinder of radius 20: the top of the letters (3 mm out) spans 2 (20 + 3) sin(W / 40)
		const line = flat.max[0]! - flat.min[0]!;
		expect(bent.max[0]! - bent.min[0]!).toBeCloseTo(2 * 23 * Math.sin(line / 40), 1);
		expect(bent.min[2]!).toBeGreaterThan(-0.01);
		expect(bent.min[2]!).toBeLessThan(0.01);
		expect(bent.max[2]! - bent.min[2]!).toBeGreaterThan(flat.max[2]! - flat.min[2]! + 1); // taller by how far the ends curl away
		expect(bent.volume).toBeGreaterThan(flat.volume); // the outside of the curve is a longer surface
		expect(bent.volume).toBeLessThan(flat.volume * 1.15);
	});

	test('a negative radius bends it the other way (inside a cylinder: the volume is a little less)', async ({ page }) => {
		const flat = await exportStl(page);
		await setWrap(page, '-20');
		const inside = await exportStl(page);
		expect(inside.volume).toBeLessThan(flat.volume);
		expect(inside.max[2]!).toBeGreaterThan(flat.max[2]! + 1);
	});

	test('has no resize handles while it is bent, gets them back flat, and Undo takes the wrap off', async ({ page }) => {
		await expect(page.getByTestId('handle-corner-pp')).toBeVisible();
		await setWrap(page, '20');
		await expect(page.getByTestId('handle-corner-pp')).toHaveCount(0);
		await setWrap(page, '0');
		await expect(page.getByTestId('handle-corner-pp')).toBeVisible();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(field(page, 'Wrap radius')).toHaveValue('20');
	});

	test('the Text panel, with the wrap and its notes showing, passes the accessibility scan', async ({ page }) => {
		await setWrap(page, '1');
		await expect(page.getByTestId('param-limited').filter({ hasText: 'Raised to' })).toBeVisible();
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
		expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
	});

	test('says when the words are too long for the radius, and keeps the wrap when the page is reloaded', async ({ page }) => {
		await setWrap(page, '1');
		await expect(page.getByTestId('param-limited').filter({ hasText: 'Raised to' })).toBeVisible();
		await expect(page.getByText('Saved', { exact: true })).toBeVisible();
		await page.reload();
		await names(page).click();
		await expect(field(page, 'Wrap radius')).toHaveValue('1');
	});
});
