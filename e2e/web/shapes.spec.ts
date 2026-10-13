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

test.describe('the polygon', () => {
	/** A regular n-gon of radius 1 with a corner at the back, stretched to a w x d box (worked out by hand). */
	const polygon = (n: number, w: number, d: number, h: number) => {
		const angles = Array.from({ length: n }, (_, k) => Math.PI / 2 + (2 * Math.PI * k) / n);
		const ys = angles.map((a) => Math.sin(a));
		return (
			(n / 2) *
			Math.sin((2 * Math.PI) / n) *
			(w / (2 * Math.max(...angles.map((a) => Math.cos(a))))) *
			(d / (Math.max(...ys) - Math.min(...ys))) *
			h
		);
	};

	test('has a Sides field (5 to start) that is a count, not millimetres, and a star does not', async ({ page }) => {
		for (const name of ['Star', 'Polygon']) await tile(page, name).click();
		await row(page, 1).click();
		await expect(field(page, 'Sides')).toHaveValue('5');
		await row(page, 0).click();
		await expect(field(page, 'Sides')).toHaveCount(0);
	});

	test('exports with the volume of its outline, and typing 8 sides changes it', async ({ page }) => {
		await tile(page, 'Polygon').click();
		expect((await exportStl(page)).volume).toBeCloseTo(polygon(5, 19.02, 18.09, 20), 0);
		await row(page, 0).click();
		await field(page, 'Sides').fill('8');
		await field(page, 'Sides').press('Enter');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).volume).toBeCloseTo(polygon(8, 19.02, 18.09, 20), 0);
	});

	test('keeps its sides when resized, and says when Sides was limited to 3 to 32', async ({ page }) => {
		await tile(page, 'Polygon').click();
		await row(page, 0).click();
		await field(page, 'Sides').fill('7');
		await field(page, 'Sides').press('Enter');
		await field(page, 'Width').fill('40');
		await field(page, 'Width').press('Enter');
		await expect(field(page, 'Sides')).toHaveValue('7');
		await field(page, 'Sides').fill('100');
		await field(page, 'Sides').press('Enter');
		await expect(page.getByTestId('param-limited')).toContainText('Limited to 32 sides');
	});
});

/*
 * Threads keep their real size: the diameter comes from the chosen Size and cannot be dragged or typed, only the Length can. The
 * export is a real thread whose volume is worked out by hand from the ISO profile, at any length.
 */
test.describe('threaded shapes', () => {
	/** pi * length * mean(r^2) of the ISO profile: crest 1/8 of the pitch, root 1/4, two flanks of 5/16 (see core's threads.test.ts). */
	const threadVolume = (diameter: number, pitch: number, length: number) => {
		const [crest, root] = [diameter / 2, diameter / 2 - 0.5413 * pitch];
		const flank = (crest * crest + crest * root + root * root) / 3;
		return Math.PI * length * ((crest * crest) / 8 + (root * root) / 4 + 2 * (5 / 16) * flank);
	};
	const pick = async (page: Page, label: string, option: string) =>
		properties(page).getByLabel(label, { exact: true }).selectOption({ label: option });

	test('a rod has a Size choice (M5 to start); its width and depth are fixed and its height is called Length', async ({ page }) => {
		await tile(page, 'Threaded Rod').click();
		await row(page, 0).click();
		await expect(field(page, 'Size')).toHaveValue('5');
		await expect(field(page, 'Fit')).toHaveCount(0);
		await expect(field(page, 'Width')).toBeDisabled();
		await expect(field(page, 'Depth')).toBeDisabled();
		await expect(field(page, 'Length')).toHaveValue('20');
		await expect(field(page, 'Length')).toBeEnabled();
	});

	test('picking another Size changes the diameter: M8 is 8 mm across, and the export is an M8 thread', async ({ page }) => {
		await tile(page, 'Threaded Rod').click();
		await row(page, 0).click();
		await pick(page, 'Size', 'M8');
		await expect(field(page, 'Width')).toHaveValue('8');
		await expect(field(page, 'Depth')).toHaveValue('8');
		const stl = await exportStl(page);
		expect(Math.abs(stl.volume - threadVolume(8, 1.25, 20)) / threadVolume(8, 1.25, 20)).toBeLessThan(0.005);
		expect(stl.max.map((v) => Math.round(v * 100) / 100)).toEqual([4, 4, 20]);
	});

	test('a longer rod keeps its thread: Length 60 exports three times the volume of 20, not a stretched thread', async ({ page }) => {
		await tile(page, 'Threaded Rod').click();
		await row(page, 0).click();
		await field(page, 'Length').fill('60');
		await field(page, 'Length').press('Enter');
		await expect(field(page, 'Length')).toHaveValue('60');
		await expect(field(page, 'Width')).toHaveValue('5');
		const stl = await exportStl(page);
		expect(Math.abs(stl.volume - threadVolume(5, 0.8, 60)) / threadVolume(5, 0.8, 60)).toBeLessThan(0.005);
	});

	test('only the height and lift handles show: there is no way to drag a thread wider', async ({ page }) => {
		await tile(page, 'Threaded Rod').click();
		await row(page, 0).click();
		await expect(page.getByTestId('handle-height')).toBeVisible();
		await expect(page.getByTestId('handle-lift')).toBeVisible();
		for (const id of ['corner-pp', 'corner-nn', 'side-px', 'side-ny']) await expect(page.getByTestId(`handle-${id}`)).toHaveCount(0);
		await tile(page, 'Box').click();
		await row(page, 1).click();
		await expect(page.getByTestId('handle-corner-pp')).toBeVisible();
	});

	test('a threaded hole has Size and Fit (Normal to start) and is a bit wider than its screw: the fit sets how much', async ({ page }) => {
		await tile(page, 'Threaded Hole').click();
		await row(page, 0).click();
		await expect(field(page, 'Fit')).toHaveValue('2');
		await expect(field(page, 'Width')).toHaveValue('5.4');
		await pick(page, 'Fit', 'Loose');
		await expect(field(page, 'Width')).toHaveValue('5.8');
		await pick(page, 'Fit', 'Tight');
		await expect(field(page, 'Width')).toHaveValue('5.2');
		await pick(page, 'Size', 'M10');
		await expect(field(page, 'Width')).toHaveValue('10.2');
	});

	test('undo puts the Size back', async ({ page }) => {
		await tile(page, 'Threaded Rod').click();
		await row(page, 0).click();
		await pick(page, 'Size', 'M12');
		await expect(field(page, 'Width')).toHaveValue('12');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+z');
		await expect(field(page, 'Width')).toHaveValue('5');
	});
});

/*
 * The bolt (a thread with a head on it) and the nut that goes on it. A bolt's Length is its shank, not counting the head; the volumes are worked
 * out by hand from the ISO sizes (an M5 hex head is 8 mm across flats and 3.5 mm high, a nut 4 mm thick).
 */
test.describe('bolts and nuts', () => {
	const mean = (crest: number, pitch: number) => {
		const root = crest - 0.5413 * pitch;
		return (crest * crest) / 8 + (root * root) / 4 + 2 * (5 / 16) * ((crest * crest + crest * root + root * root) / 3);
	};
	const hexArea = (flats: number) => 2 * Math.sqrt(3) * (flats / 2) ** 2;
	const pick = async (page: Page, label: string, option: string) =>
		properties(page).getByLabel(label, { exact: true }).selectOption({ label: option });

	test('a bolt has Size and Head (Hex to start), and its Length is the shank: 20 mm, with the head on top of it', async ({ page }) => {
		await tile(page, 'Bolt').click();
		await row(page, 0).click();
		await expect(field(page, 'Size')).toHaveValue('5');
		await expect(field(page, 'Head')).toHaveValue('1');
		await expect(field(page, 'Length')).toHaveValue('20');
		await expect(field(page, 'Width')).toBeDisabled();
		await expect(field(page, 'Width')).toHaveValue('9.24'); // a hex across its corners
		await expect(field(page, 'Depth')).toHaveValue('8');
	});

	test('a hex bolt exports as its thread plus its head, 23.5 mm tall in all', async ({ page }) => {
		await tile(page, 'Bolt').click();
		const stl = await exportStl(page);
		const exact = Math.PI * 20 * mean(2.5, 0.8) + hexArea(8) * 3.5;
		expect(Math.abs(stl.volume - exact) / exact).toBeLessThan(0.005);
		expect(stl.max[2]).toBeCloseTo(23.5, 3);
	});

	test('a socket cap bolt is round and 25 mm tall, and changing the head keeps the 20 mm shank', async ({ page }) => {
		await tile(page, 'Bolt').click();
		await row(page, 0).click();
		await pick(page, 'Head', 'Socket cap');
		await expect(field(page, 'Length')).toHaveValue('20');
		await expect(field(page, 'Width')).toHaveValue('8.5');
		await expect(field(page, 'Depth')).toHaveValue('8.5');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).max[2]).toBeCloseTo(25, 3);
	});

	test('typing a Length changes the shank, not the head: 40 mm exports 43.5 mm tall', async ({ page }) => {
		await tile(page, 'Bolt').click();
		await row(page, 0).click();
		await field(page, 'Length').fill('40');
		await field(page, 'Length').press('Enter');
		await expect(field(page, 'Length')).toHaveValue('40');
		await page.getByRole('heading', { name: 'Objects' }).click();
		const stl = await exportStl(page);
		expect(stl.max[2]).toBeCloseTo(43.5, 3);
		const exact = Math.PI * 40 * mean(2.5, 0.8) + hexArea(8) * 3.5;
		expect(Math.abs(stl.volume - exact) / exact).toBeLessThan(0.005);
	});

	test('a nut is 4 mm thick and a hex 8 mm across flats with an M5 thread through it, and its Fit opens the thread', async ({ page }) => {
		await tile(page, 'Nut').click();
		await row(page, 0).click();
		await expect(field(page, 'Fit')).toHaveValue('2');
		await expect(field(page, 'Length')).toHaveValue('4');
		const exact = hexArea(8) * 4 - Math.PI * 4 * mean(2.7, 0.8);
		const normal = (await exportStl(page)).volume;
		expect(Math.abs(normal - exact) / exact).toBeLessThan(0.006);
		await pick(page, 'Fit', 'Loose');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).volume).toBeLessThan(normal); // a looser nut has less in it
		await expect(field(page, 'Width')).toHaveValue('9.24'); // and the outside is the same
	});

	test('a bigger nut size sets its standard thickness (M8 is 6.5 mm); only the lift and Length handles show on a bolt and a nut', async ({
		page,
	}) => {
		await tile(page, 'Nut').click();
		await row(page, 0).click();
		await pick(page, 'Size', 'M8');
		await expect(field(page, 'Length')).toHaveValue('6.5');
		for (const id of ['corner-pp', 'side-px']) await expect(page.getByTestId(`handle-${id}`)).toHaveCount(0);
		await expect(page.getByTestId('handle-height')).toBeVisible();
	});
});

/*
 * Simple threads: while editing, threads can be drawn as plain cylinders (a fraction of the triangles); the export is always the real thread.
 */
test.describe('the thread detail switch', () => {
	const toggle = (page: Page) => page.getByRole('toolbar', { name: 'View controls' }).getByRole('button', { name: 'Simple threads' });

	test('is only offered once there is a thread, and starts off', async ({ page }) => {
		await tile(page, 'Box').click();
		await expect(toggle(page)).toHaveCount(0);
		await tile(page, 'Threaded Rod').click();
		await expect(toggle(page)).toBeVisible();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('turns on and off, and is remembered after a reload', async ({ page }) => {
		await tile(page, 'Bolt').click();
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
		await page.getByText('Saved', { exact: true }).waitFor();
		await page.reload();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('the export is the real thread whichever is showing, and the typed values are untouched', async ({ page }) => {
		await tile(page, 'Threaded Rod').click();
		const real = (await exportStl(page)).volume;
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
		expect((await exportStl(page)).volume).toBeCloseTo(real, 6);
		await row(page, 0).click();
		await expect(field(page, 'Length')).toHaveValue('20');
	});
});

/*
 * The washer (a flat ring) and the standoff (a long hex with a thread in it, female or with a stud), exported for real.
 */
test.describe('washers and standoffs', () => {
	const disc = (r: number) => 24 * r * r * Math.sin((2 * Math.PI) / 48);
	const hexArea = (flats: number) => 2 * Math.sqrt(3) * (flats / 2) ** 2;
	const mean = (crest: number, pitch: number) => {
		const root = crest - 0.5413 * pitch;
		return (crest * crest) / 8 + (root * root) / 4 + 2 * (5 / 16) * ((crest * crest + crest * root + root * root) / 3);
	};
	const pick = async (page: Page, label: string, option: string) =>
		properties(page).getByLabel(label, { exact: true }).selectOption({ label: option });

	test('a washer is an M5 10 mm across and 1 mm thick, with a Size choice only and a fixed width', async ({ page }) => {
		await tile(page, 'Washer').click();
		await row(page, 0).click();
		await expect(field(page, 'Size')).toHaveValue('5');
		await expect(field(page, 'Fit')).toHaveCount(0);
		await expect(field(page, 'Width')).toHaveValue('10');
		await expect(field(page, 'Width')).toBeDisabled();
		await expect(field(page, 'Length')).toHaveValue('1');
		await pick(page, 'Size', 'M8');
		await expect(field(page, 'Width')).toHaveValue('16');
		await expect(field(page, 'Length')).toHaveValue('1.6');
	});

	test('a washer exports as the ring between its circles, and has no thread for the Simple threads switch to change', async ({ page }) => {
		await tile(page, 'Washer').click();
		const stl = await exportStl(page);
		const exact = (disc(5) - disc(2.65)) * 1;
		expect(Math.abs(stl.volume - exact) / exact).toBeLessThan(0.001);
		await expect(page.getByRole('toolbar', { name: 'View controls' }).getByRole('button', { name: 'Simple threads' })).toHaveCount(0);
		await tile(page, 'Standoff').click();
		await expect(page.getByRole('toolbar', { name: 'View controls' }).getByRole('button', { name: 'Simple threads' })).toBeVisible();
	});

	test('a standoff has Size, Ends (Female-female) and Fit, is 10 mm long, and exports as a hex with a thread right through it', async ({
		page,
	}) => {
		await tile(page, 'Standoff').click();
		await row(page, 0).click();
		await expect(field(page, 'Ends')).toHaveValue('1');
		await expect(field(page, 'Fit')).toHaveValue('2');
		await expect(field(page, 'Length')).toHaveValue('10');
		const exact = hexArea(8) * 10 - Math.PI * 10 * mean(2.7, 0.8);
		expect(Math.abs((await exportStl(page)).volume - exact) / exact).toBeLessThan(0.006);
	});

	test('a male standoff has a 10 mm stud under its body: Length stays 10 and it is 20 mm tall', async ({ page }) => {
		await tile(page, 'Standoff').click();
		await row(page, 0).click();
		await pick(page, 'Ends', 'Male-female');
		await expect(field(page, 'Length')).toHaveValue('10');
		await page.getByRole('heading', { name: 'Objects' }).click();
		const stl = await exportStl(page);
		expect(stl.max[2]).toBeCloseTo(20, 3);
		const exact = Math.PI * 10 * mean(2.5, 0.8) + hexArea(8) * 10 - Math.PI * 5 * mean(2.7, 0.8);
		expect(Math.abs(stl.volume - exact) / exact).toBeLessThan(0.006);
	});

	test('a standoff cannot be made shorter than it can hold (an M5 male one needs a 10 mm body)', async ({ page }) => {
		await tile(page, 'Standoff').click();
		await row(page, 0).click();
		await pick(page, 'Ends', 'Male-female');
		await field(page, 'Length').fill('3');
		await field(page, 'Length').press('Enter');
		await expect(field(page, 'Length')).toHaveValue('10');
	});
});
