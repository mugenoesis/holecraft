import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { newDesign, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * The basic shapes in the Shapes panel: each tile adds its shape, and a real STL export of the shape has the volume its
 * dimensions give (worked out here by hand), proving it is built right all the way through the CSG engine and the export.
 */

const TILES = [
	'Box',
	'Cylinder',
	'Sphere',
	'Cone',
	'Pyramid',
	'Wedge',
	'Roof',
	'Round Roof',
	'Half Sphere',
	'Tube',
	'Torus',
	'Hexagon',
	'Star',
];
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

/*
 * Shapes with settings of their own: the tube's wall and the torus's ring. The Properties panel makes a field for each, the
 * settings are in mm, and a real export has the volume the dimensions give.
 */
const N = 64;
/** Area of an N-sided polygon inscribed in a circle of radius r. */
const disc = (r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
const field = (page: Page, name: string) => properties(page).getByLabel(name, { exact: true });
const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();

test.describe('shapes with settings of their own', () => {
	test('a tube has a Wall thickness field (3 mm to start), and a box, cylinder or torus does not', async ({ page }) => {
		for (const name of ['Box', 'Cylinder', 'Tube', 'Torus']) await tile(page, name).click();
		await row(page, 2).click();
		await expect(field(page, 'Wall thickness')).toHaveValue('3');
		for (const i of [0, 1, 3]) {
			await row(page, i).click();
			await expect(field(page, 'Wall thickness')).toHaveCount(0);
		}
	});

	test('a torus has a Ring thickness field (10 mm to start)', async ({ page }) => {
		await tile(page, 'Torus').click();
		await row(page, 0).click();
		await expect(field(page, 'Ring thickness')).toHaveValue('10');
		await expect(field(page, 'Width')).toHaveValue('30');
		await expect(field(page, 'Height')).toHaveValue('10');
	});

	test('a tube exports with its wall: the outer disc minus the inner, 20 mm high; typing a thicker wall changes it', async ({ page }) => {
		await tile(page, 'Tube').click();
		expect((await exportStl(page)).volume).toBeCloseTo((disc(10) - disc(7)) * 20, 1);
		await row(page, 0).click();
		await field(page, 'Wall thickness').fill('5');
		await field(page, 'Wall thickness').press('Enter');
		await expect(field(page, 'Wall thickness')).toHaveValue('5');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).volume).toBeCloseTo((disc(10) - disc(5)) * 20, 1);
	});

	test('a wall too thick for the tube says it is limited, and the tube is still made', async ({ page }) => {
		await tile(page, 'Tube').click();
		await row(page, 0).click();
		await field(page, 'Wall thickness').fill('30');
		await field(page, 'Wall thickness').press('Enter');
		await expect(page.getByTestId('param-limited')).toContainText('Limited to 9.5 mm');
		await field(page, 'Wall thickness').fill('2');
		await field(page, 'Wall thickness').press('Enter');
		await expect(page.getByTestId('param-limited')).toHaveCount(0);
	});

	test('a torus exports as a ring (within the facet error of 2 * pi^2 * R * r^2)', async ({ page }) => {
		await tile(page, 'Torus').click();
		const stl = await exportStl(page);
		const exact = 2 * Math.PI ** 2 * 10 * 5 ** 2;
		expect(stl.volume).toBeLessThan(exact);
		expect((exact - stl.volume) / exact).toBeLessThan(0.02);
		expect(stl.min.map((v) => Math.round(v))).toEqual([-15, -15, 0]);
		expect(stl.max.map((v) => Math.round(v))).toEqual([15, 15, 10]);
	});

	test('resizing stretches the whole tube evenly: the wall field follows (3 mm at 20 wide, 6 mm at 40), and so does the export', async ({
		page,
	}) => {
		await tile(page, 'Tube').click();
		await row(page, 0).click();
		await field(page, 'Width').fill('40');
		await field(page, 'Width').press('Enter');
		await field(page, 'Depth').fill('40');
		await field(page, 'Depth').press('Enter');
		await expect(field(page, 'Wall thickness')).toHaveValue('6');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).volume).toBeCloseTo((disc(20) - disc(14)) * 20, 1); // the hole is 70% of the outside, as it was
	});

	test('a torus’s ring thickens with it when resized (10 mm at 30 wide, 20 mm at 60)', async ({ page }) => {
		await tile(page, 'Torus').click();
		await row(page, 0).click();
		await field(page, 'Width').fill('60');
		await field(page, 'Width').press('Enter');
		await field(page, 'Depth').fill('60');
		await field(page, 'Depth').press('Enter');
		await expect(field(page, 'Ring thickness')).toHaveValue('20');
	});

	test('undo puts the wall back', async ({ page }) => {
		await tile(page, 'Tube').click();
		await row(page, 0).click();
		await field(page, 'Wall thickness').fill('6');
		await field(page, 'Wall thickness').press('Enter');
		await expect(field(page, 'Wall thickness')).toHaveValue('6');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+z');
		await expect(field(page, 'Wall thickness')).toHaveValue('3');
	});
});

/*
 * The hexagon (a plain stretched solid, a nut's outline) and the star (five tips, with an Inner radius setting), exported for real:
 * the volumes are worked out here by hand from the outlines.
 */
test.describe('the hexagon and the star', () => {
	test('a hexagon exports with the volume of its outline: 3/4 of its box (20 x 17.32 x 20 mm)', async ({ page }) => {
		await tile(page, 'Hexagon').click();
		const stl = await exportStl(page);
		expect(stl.volume).toBeCloseTo(0.75 * 20 * 17.32 * 20, 1);
		expect(stl.min.map((v) => Math.round(v * 100) / 100)).toEqual([-10, -8.66, 0]);
		expect(stl.max.map((v) => Math.round(v * 100) / 100)).toEqual([10, 8.66, 20]);
	});

	test('a star has an Inner radius field (4 mm to start) and a hexagon does not', async ({ page }) => {
		for (const name of ['Hexagon', 'Star']) await tile(page, name).click();
		await row(page, 1).click();
		await expect(field(page, 'Inner radius')).toHaveValue('4');
		await row(page, 0).click();
		await expect(field(page, 'Inner radius')).toHaveCount(0);
	});

	test('a star exports with the volume of its outline, and a fatter inner radius makes it heavier', async ({ page }) => {
		const star = (r: number) =>
			5 * r * Math.sin(Math.PI / 5) * (20 / (2 * Math.sin((2 * Math.PI) / 5))) * (19.02 / (1 + Math.cos(Math.PI / 5))) * 10;
		await tile(page, 'Star').click();
		expect((await exportStl(page)).volume).toBeCloseTo(star(0.4), 0);
		await row(page, 0).click();
		await field(page, 'Inner radius').fill('6');
		await field(page, 'Inner radius').press('Enter');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).volume).toBeCloseTo(star(0.6), 0);
	});

	test('a star’s inner radius grows with it when resized (4 mm at 20 wide, 8 mm at 40)', async ({ page }) => {
		await tile(page, 'Star').click();
		await row(page, 0).click();
		await field(page, 'Width').fill('40');
		await field(page, 'Width').press('Enter');
		await expect(field(page, 'Inner radius')).toHaveValue('8');
	});
});
