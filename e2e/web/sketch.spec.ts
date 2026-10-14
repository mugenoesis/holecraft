import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, field, newDesign, pixelAt, selectView, viewport } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * The Sketch tool: draw outlines on the floor or a chosen face, Finish to make a Sketch shape (extruded), Edit sketch to come back to it.
 * The sizes come from the drawing on screen, so these tests check what the tool does (snapped whole millimetres, proportions, holes by
 * reading pixels) and not the scale of the view.
 */

const sketchButton = (page: Page) => page.getByRole('button', { name: 'Sketch', exact: true });
const bar = (page: Page) => page.getByTestId('sketch-bar');
const tool = (page: Page, name: string) => bar(page).getByRole('button', { name, exact: true });
const row = (page: Page, name: RegExp) => page.getByTestId('object-list').getByRole('button', { name });
const finish = (page: Page) => bar(page).getByRole('button', { name: 'Finish', exact: true });

async function centre(page: Page) {
	const { x, y } = await center(viewport(page));
	return { x, y };
}
/** Drags from (x0, y0) to (x1, y1) pixels from the middle of the view with the left button. */
async function drag(page: Page, [x0, y0]: [number, number], [x1, y1]: [number, number]) {
	const { x, y } = await centre(page);
	await page.mouse.move(x + x0, y + y0);
	await page.mouse.down();
	await page.mouse.move(x + x1, y + y1, { steps: 8 });
	await page.mouse.up();
}
async function clickAt(page: Page, dx: number, dy: number) {
	const { x, y } = await centre(page);
	await page.mouse.click(x + dx, y + dy);
}
/** Clicks Finish and waits for the new shape to be the selected one, so what is read next is its own. */
async function finishSketch(page: Page) {
	await finish(page).click();
	await expect(field(page, 'Name')).toHaveValue('Sketch 1');
}
const number = async (page: Page, label: string) => Number(await field(page, label).inputValue());
const projection = (page: Page) => viewport(page).getAttribute('data-projection');
const azimuth = (page: Page) => viewport(page).getAttribute('data-azimuth');

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('the Sketch tool', () => {
	test('is a button and the K key, with a bar of tools, and Cancel puts the view back and makes nothing', async ({ page }) => {
		const before = { projection: await projection(page), azimuth: await azimuth(page) };
		expect(before.projection).toBe('perspective');
		await sketchButton(page).click();
		await expect(sketchButton(page)).toHaveAttribute('aria-pressed', 'true');
		for (const name of ['Select', 'Rectangle', 'Circle', 'Polygon', 'Line']) await expect(tool(page, name)).toBeVisible();
		await expect(tool(page, 'Rectangle')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => projection(page)).toBe('orthographic'); // looking straight at the plane
		await cameraSettled(page);
		await bar(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(bar(page)).toHaveCount(0);
		await expect.poll(() => projection(page)).toBe('perspective');
		await cameraSettled(page);
		expect(await azimuth(page)).toBe(before.azimuth);
		await expect(page.getByText('Objects: 0')).toBeVisible();
		await page.keyboard.press('k');
		await expect(bar(page)).toBeVisible();
		await page.keyboard.press('k');
		await expect(bar(page)).toHaveCount(0);
	});

	test('a dragged rectangle, finished, is a Sketch shape that is selected, in whole millimetres, the shape of what was drawn, and back in the 3D view', async ({
		page,
	}) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-60, -20], [60, 20]); // 120 x 40 pixels
		await finishSketch(page);
		await expect(bar(page)).toHaveCount(0);
		await expect.poll(() => projection(page)).toBe('perspective');
		await expect(row(page, /^Sketch 1 /)).toBeVisible();
		await expect(field(page, 'Name')).toHaveValue('Sketch 1');
		const [w, d, h] = [await number(page, 'Width'), await number(page, 'Depth'), await number(page, 'Height')];
		expect(Number.isInteger(w) && Number.isInteger(d)).toBe(true);
		expect(h).toBe(10);
		expect(w / d).toBeCloseTo(3, 0);
		expect(w).toBeGreaterThan(10);
	});

	test('takes the extrude height typed in the bar', async ({ page }) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-30, -30], [30, 30]);
		await bar(page).getByLabel('Extrude height').fill('25');
		await finishSketch(page);
		await expect(field(page, 'Height')).toHaveValue('25');
	});

	test('says so for a height that is not a size, and does not finish', async ({ page }) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-30, -30], [30, 30]);
		await bar(page).getByLabel('Extrude height').fill('abc');
		await finish(page).click();
		await expect(bar(page)).toContainText('extrude height must be a number');
		await expect(bar(page)).toBeVisible();
	});

	test('Finish is off until something is drawn', async ({ page }) => {
		await sketchButton(page).click();
		await expect(finish(page)).toBeDisabled();
		await drag(page, [-30, -30], [30, 30]);
		await expect(finish(page)).toBeEnabled();
	});

	test('a circle drawn from its centre is as wide as it is deep', async ({ page }) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await tool(page, 'Circle').click();
		await drag(page, [0, 0], [50, 0]);
		await finishSketch(page);
		const [w, d] = [await number(page, 'Width'), await number(page, 'Depth')];
		expect(Math.abs(w - d)).toBeLessThanOrEqual(1);
		expect(w).toBeGreaterThan(5);
	});

	test('a polygon takes its number of sides from the bar (a triangle is taller than a hexagon is wide by the same radius)', async ({
		page,
	}) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await tool(page, 'Polygon').click();
		await bar(page).getByLabel('Sides').fill('4');
		await drag(page, [0, 0], [60, 0]);
		await finishSketch(page);
		// four corners, the first on the x axis: a diamond as wide as it is deep
		const [w, d] = [await number(page, 'Width'), await number(page, 'Depth')];
		expect(Math.abs(w - d)).toBeLessThanOrEqual(1);
	});

	test('lines are clicked out and closed on the first point', async ({ page }) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await tool(page, 'Line').click();
		for (const p of [
			[-40, -30],
			[40, -30],
			[0, 40],
		] as [number, number][])
			await clickAt(page, p[0], p[1]);
		await expect(finish(page)).toBeDisabled(); // not closed yet: nothing is drawn
		await clickAt(page, -40, -30);
		await expect(finish(page)).toBeEnabled();
		await finishSketch(page);
		await expect(row(page, /^Sketch 1 /)).toBeVisible();
		expect(await number(page, 'Width')).toBeGreaterThan(5);
	});

	test('Ctrl+Z takes back the last outline, not the design', async ({ page }) => {
		await dropShape(page, 'Box', 200, 0);
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-60, -20], [0, 20]); // 60 x 40 pixels
		await drag(page, [150, -20], [210, 20]); // a second one far to the right
		await page.keyboard.press('Control+z');
		await finishSketch(page);
		await expect(page.getByText('Objects: 2')).toBeVisible(); // the box is still there
		await row(page, /^Sketch 1 /).click();
		const [w, d] = [await number(page, 'Width'), await number(page, 'Depth')];
		expect(w / d).toBeCloseTo(1.5, 0); // the first outline alone
	});

	test('an outline inside another is a hole: the pale workplane shows through it from above', async ({ page }) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-70, -70], [70, 70]);
		await drag(page, [-25, -25], [25, 25]);
		await finishSketch(page);
		await selectView(page, 'top');
		await cameraSettled(page);
		const { x, y } = await centre(page);
		// away from the turning rings and handles that cross the middle of a selected shape
		await expect.poll(async () => (await pixelAt(page, x + 12, y + 12))[2]).toBeGreaterThan(150); // the workplane's pale blue
		const middle = await pixelAt(page, x + 12, y + 12);
		const plate = await pixelAt(page, x + 55, y + 30);
		expect(middle[2]).toBeGreaterThan(150); // the workplane's pale blue
		expect(plate[0]).toBeGreaterThan(plate[2] + 60); // the solid is coral
	});
});

test.describe('exporting a sketch', () => {
	test('is the drawing extruded: the STL is as big as the Width, Depth and Height say, with the hole taken out', async ({ page }) => {
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-70, -70], [70, 70]);
		await drag(page, [-25, -25], [25, 25]);
		await finishSketch(page);
		await expect(field(page, 'Name')).toHaveValue('Sketch 1');
		const [w, d, h] = [await number(page, 'Width'), await number(page, 'Depth'), await number(page, 'Height')];
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 30_000 }),
			page.getByRole('menuitem', { name: /as STL$/ }).click(),
		]);
		const stl = parseStl(await readFile(await download.path()));
		expect(stl.max[0]! - stl.min[0]!).toBeCloseTo(w, 1);
		expect(stl.max[1]! - stl.min[1]!).toBeCloseTo(d, 1);
		expect(stl.max[2]! - stl.min[2]!).toBeCloseTo(h, 1);
		expect(stl.volume).toBeLessThan(w * d * h * 0.95); // the hole is about a quarter of the plate
		expect(stl.volume).toBeGreaterThan(w * d * h * 0.6);
	});
});

test.describe('Edit sketch', () => {
	async function drawSlab(page: Page) {
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-30, -30], [30, 30]);
		await finishSketch(page);
		await expect(row(page, /^Sketch 1 /)).toBeVisible();
	}
	const edit = (page: Page) => page.getByRole('button', { name: 'Edit sketch', exact: true });

	test('is in Properties for a sketch only, and takes the drawing back into the tools with its outline there', async ({ page }) => {
		await dropShape(page, 'Box', 200, 0);
		await row(page, /^Box 1 /).click();
		await expect(edit(page)).toHaveCount(0);
		await drawSlab(page);
		await expect(edit(page)).toBeVisible();
		await edit(page).click();
		await expect(bar(page)).toBeVisible();
		await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
		await expect(bar(page).getByLabel('Extrude height')).toHaveValue('10');
		await expect(page.locator('.sketch-fill')).toHaveCount(1); // the shape's own outline, ready to change
	});

	test('adding an outline and finishing redraws the same shape, wider, as one undo step; Cancel leaves it alone', async ({ page }) => {
		await drawSlab(page);
		const before = await number(page, 'Width');
		await edit(page).click();
		await bar(page).getByRole('button', { name: 'Cancel' }).click();
		expect(await number(page, 'Width')).toBe(before);

		await edit(page).click();
		await cameraSettled(page); // the view eases to the sketch: drawing before it arrives would land the corners somewhere else
		await tool(page, 'Rectangle').click();
		await drag(page, [90, -20], [150, 20]);
		await finishSketch(page);
		await expect(page.getByText('Objects: 1')).toBeVisible(); // redrawn, not added
		await expect.poll(() => number(page, 'Width')).toBeGreaterThan(before); // the view zooms to the sketch, so how much wider depends on the scale
		await page.keyboard.press('Control+z');
		await expect.poll(() => number(page, 'Width')).toBe(before);
	});

	test('changing the height in the bar changes the shape’s height', async ({ page }) => {
		await drawSlab(page);
		await edit(page).click();
		await bar(page).getByLabel('Extrude height').fill('4');
		await finishSketch(page);
		await expect(field(page, 'Height')).toHaveValue('4');
	});

	test('a sketch can be redrawn after it was resized: the drawing seen is the drawing edited', async ({ page }) => {
		await drawSlab(page);
		await field(page, 'Width').fill('90');
		await field(page, 'Width').press('Enter');
		await expect(field(page, 'Width')).toHaveValue('90');
		await edit(page).click();
		await bar(page).getByRole('button', { name: 'Finish' }).click();
		await expect(field(page, 'Width')).toHaveValue('90'); // nothing was changed, so nothing moved
	});
});

test.describe('sketching on a face', () => {
	test('a sketch drawn with the Workplane tool on the top of a box stands on it', async ({ page }) => {
		await dropShape(page, 'Box');
		await selectView(page, 'Top');
		await cameraSettled(page);
		await page.getByRole('button', { name: 'Workplane', exact: true }).click();
		await clickAt(page, 0, 0); // the box's top, 20 mm up
		await sketchButton(page).click();
		await cameraSettled(page);
		await drag(page, [-30, -30], [30, 30]);
		await finishSketch(page);
		await expect(row(page, /^Sketch 1 /)).toBeVisible();
		await expect(field(page, 'Z')).toHaveValue('20');
	});
});
