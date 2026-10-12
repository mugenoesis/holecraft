import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { newDesign, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * The basic shapes in the Shapes panel: each tile adds its shape, and a real STL export of the shape has the volume its
 * dimensions give (worked out here by hand), proving it is built right all the way through the CSG engine and the export.
 */

const TILES = ['Box', 'Cylinder', 'Sphere', 'Cone', 'Pyramid', 'Wedge', 'Roof', 'Round Roof', 'Half Sphere'];
const list = (page: Page) => page.getByTestId('object-list');
const tile = (page: Page, name: string) => page.getByRole('region', { name: 'Shapes' }).getByRole('button', { name, exact: true });

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
});

test.describe('the Shapes panel', () => {
	test('has a tile for every basic shape, and none runs off the panel', async ({ page }) => {
		for (const name of TILES) await expect(tile(page, name)).toBeVisible();
		const panel = (await page.locator('.panel').boundingBox())!;
		for (const name of TILES) {
			const b = (await tile(page, name).boundingBox())!;
			expect(b.x, name).toBeGreaterThanOrEqual(panel.x);
			expect(b.x + b.width, name).toBeLessThanOrEqual(panel.x + panel.width);
		}
	});

	test('clicking a tile adds that shape, named and numbered, at its default size', async ({ page }) => {
		for (const name of TILES.slice(3)) {
			await tile(page, name).click();
			await expect(list(page).getByRole('button', { name: new RegExp(`^${name} 1 `) })).toBeVisible();
		}
		await list(page)
			.getByRole('button', { name: /^Wedge 1 / })
			.click();
		await expect(properties(page).getByLabel('Width', { exact: true })).toHaveValue('20');
		await expect(properties(page).getByLabel('Height', { exact: true })).toHaveValue('20');
	});

	// 20 mm each way: a pyramid is a third of its bounding box, a wedge and a roof half of it
	for (const [name, volume] of [
		['Pyramid', 8000 / 3],
		['Wedge', 4000],
		['Roof', 4000],
	] as const) {
		test(`a ${name} exports with its volume (${volume.toFixed(1)} mm3 at 20 x 20 x 20)`, async ({ page }) => {
			await tile(page, name).click();
			const stl = await exportStl(page);
			expect(stl.volume).toBeCloseTo(volume, 1);
			expect(stl.min.map((v) => Math.round(v))).toEqual([-10, -10, 0]);
			expect(stl.max.map((v) => Math.round(v))).toEqual([10, 10, 20]);
		});
	}

	// round shapes are faceted, so they come out a little under the true volume (the tolerance is the facet error)
	for (const [name, volume, tolerance] of [
		['Cone', (Math.PI * 100 * 20) / 3, 0.01],
		['Round Roof', (Math.PI * 10 * 20 * 20) / 2, 0.01], // half an ellipse 10 out and 20 high, 20 long
		['Half Sphere', (2 / 3) * Math.PI * 10 * 10 * 20, 0.015], // half an ellipsoid 10 x 10 x 20
	] as const) {
		test(`a ${name} exports within ${tolerance * 100}% of its true volume`, async ({ page }) => {
			await tile(page, name).click();
			const stl = await exportStl(page);
			expect(stl.volume).toBeLessThan(volume);
			expect((volume - stl.volume) / volume).toBeLessThan(tolerance);
		});
	}
});
