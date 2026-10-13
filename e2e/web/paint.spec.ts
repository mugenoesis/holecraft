import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, newDesign, pixelAt, selectView, viewport } from './helpers.ts';
import { read3mf } from './meshFiles.ts';

/*
 * The Paint tool, laid out like OrcaSlicer's colour painting. These tests read real pixels (a painted face is teal where an unpainted
 * one is orange) and look inside a real 3MF for OrcaSlicer, which gets a paint_color on exactly the painted triangles.
 *
 * The default palette's filament 1 is orange (#f28c28) and 2 is teal (#2a9d8f).
 */

const paintButton = (page: Page) => page.getByRole('button', { name: 'Paint', exact: true });
const panel = (page: Page) => page.getByTestId('paint-tool');
const swatch = (page: Page, n: number) => panel(page).getByRole('button', { name: new RegExp(`^Filament ${n}:`) });
// by hue, since a face turned from the light is darker (a shaded orange side is brown)
const isTeal = ([r, g, b]: [number, number, number]) => g - r > 40 && b - r > 30;
const isOrange = ([r, g, b]: [number, number, number]) => r - b > 60 && r - g > 20;

async function centre(page: Page) {
	const { x, y } = await center(viewport(page));
	return { x, y };
}
async function colourAtCentre(page: Page, dx = 0, dy = 0) {
	const { x, y } = await centre(page);
	return pixelAt(page, x + dx, y + dy);
}
async function click(page: Page, dx = 0, dy = 0, shift = false) {
	const { x, y } = await centre(page);
	if (shift) await page.keyboard.down('Shift');
	await page.mouse.click(x + dx, y + dy);
	if (shift) await page.keyboard.up('Shift');
}

/** A box in the middle of the view, seen from straight above, with the Paint tool on and filament 2 chosen. */
async function ready(page: Page) {
	await newDesign(page);
	await dropShape(page, 'Box');
	await selectView(page, 'top');
	await cameraSettled(page);
	await paintButton(page).click();
	await swatch(page, 2).click();
}

test.describe('the Paint tool', () => {
	test('is a button in the view toolbar and the N key, with a bar of the palette’s filaments, and Done or Escape leave it', async ({
		page,
	}) => {
		await newDesign(page);
		await expect(panel(page)).toHaveCount(0);
		await paintButton(page).click();
		await expect(paintButton(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(panel(page).getByRole('group', { name: 'Filaments' }).getByRole('button')).toHaveCount(4);
		await expect(panel(page).getByRole('radio', { name: 'Smart fill' })).toBeChecked();
		await panel(page).getByRole('button', { name: 'Done' }).click();
		await expect(panel(page)).toHaveCount(0);
		await page.keyboard.press('n');
		await expect(panel(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(panel(page)).toHaveCount(0);
		await expect(paintButton(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('a number key chooses the filament', async ({ page }) => {
		await newDesign(page);
		await paintButton(page).click();
		await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('3');
		await expect(swatch(page, 3)).toHaveAttribute('aria-pressed', 'true');
		await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'false');
	});

	test('a number key chooses the filament even with a tool button or a slider focused (they take no digits)', async ({ page }) => {
		await newDesign(page);
		await paintButton(page).click();
		await panel(page).getByRole('radio', { name: 'Brush', exact: true }).check();
		await page.keyboard.press('2');
		await expect(swatch(page, 2)).toHaveAttribute('aria-pressed', 'true');
		await panel(page).getByRole('slider', { name: 'Brush size' }).focus();
		await page.keyboard.press('3');
		await expect(swatch(page, 3)).toHaveAttribute('aria-pressed', 'true');
	});

	test('a click paints the face in the chosen filament and only that face; one undo takes it off', async ({ page }) => {
		await ready(page);
		expect(isOrange(await colourAtCentre(page))).toBe(true);
		await click(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await expect.poll(async () => isTeal(await colourAtCentre(page, 20, 0))).toBe(true); // the whole top, not just where it was clicked
		await panel(page).getByRole('button', { name: 'Done' }).click();
		await selectView(page, 'front');
		await cameraSettled(page);
		expect(isOrange(await colourAtCentre(page, 0, -20))).toBe(true); // the front is still orange (a smart fill stops at the edge)
		await page.keyboard.press('Control+z');
		await selectView(page, 'top');
		await cameraSettled(page);
		await expect.poll(async () => isOrange(await colourAtCentre(page))).toBe(true);
	});

	test('Shift+click erases the paint on that face', async ({ page }) => {
		await ready(page);
		await click(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await click(page, 0, 0, true);
		await expect.poll(async () => isOrange(await colourAtCentre(page))).toBe(true);
	});

	test('a bucket fill paints everything joined that is the same colour, across the edges: the front too', async ({ page }) => {
		await ready(page);
		await panel(page).getByRole('radio', { name: 'Bucket fill' }).check();
		await click(page);
		await panel(page).getByRole('button', { name: 'Done' }).click();
		await selectView(page, 'front');
		await cameraSettled(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page, 0, -20))).toBe(true);
	});

	test('Erase all takes every fill off the selected shape', async ({ page }) => {
		await ready(page);
		await expect(panel(page).getByRole('button', { name: 'Erase all' })).toBeDisabled();
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /^Box 1 / })
			.click();
		await click(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await panel(page).getByRole('button', { name: 'Erase all' }).click();
		await expect.poll(async () => isOrange(await colourAtCentre(page))).toBe(true);
		await expect(panel(page).getByRole('button', { name: 'Erase all' })).toBeDisabled();
	});

	test('the paint is saved with the design', async ({ page }) => {
		await ready(page);
		await click(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await selectView(page, 'top');
		await cameraSettled(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
	});

	test('says so instead of painting a locked shape', async ({ page }) => {
		await ready(page);
		await page.getByTestId('object-list').getByRole('button', { name: 'Lock' }).click();
		await click(page);
		await expect(panel(page)).toContainText('is locked');
		expect(isOrange(await colourAtCentre(page))).toBe(true);
	});

	test('the 3MF for OrcaSlicer marks exactly the painted triangles with their filament, and the plain 3MF has no paint', async ({
		page,
	}) => {
		await ready(page);
		await click(page);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await panel(page).getByRole('button', { name: 'Done' }).click();

		const exportAs = async (item: string, exact = false) => {
			await page.getByRole('button', { name: 'Export', exact: true }).click();
			const [download] = await Promise.all([
				page.waitForEvent('download', { timeout: 30_000 }),
				page.getByRole('menuitem', { name: item, exact }).click(),
			]);
			return read3mf(await readFile(await download.path()))['3D/3dmodel.model']!;
		};
		const orca = await exportAs('Export as 3MF for OrcaSlicer');
		expect(orca.match(/paint_color="8"/g)).toHaveLength(2); // the top of a box: two triangles, filament 2
		expect(orca.match(/<triangle /g)).toHaveLength(12);
		expect(await exportAs('Export as 3MF', true)).not.toContain('paint_color');
	});
});

test.describe('the brush', () => {
	const tool = (page: Page, name: string) => panel(page).getByRole('radio', { name, exact: true });
	const size = (page: Page) => panel(page).getByRole('slider', { name: 'Brush size' });

	/** Presses at (x0, y0) pixels from the middle of the view and drags to (x1, y1), as a mouse. */
	async function stroke(page: Page, [x0, y0]: [number, number], [x1, y1]: [number, number], shift = false) {
		const { x, y } = await centre(page);
		if (shift) await page.keyboard.down('Shift');
		await page.mouse.move(x + x0, y + y0);
		await page.mouse.down();
		await page.mouse.move(x + x1, y + y1, { steps: 12 });
		await page.mouse.up();
		if (shift) await page.keyboard.up('Shift');
		await page.mouse.move(x + 200, y + 150); // off the shape, so the brush ring is not in the way of the pixels read
	}
	async function setSize(page: Page, mm: number) {
		await size(page).fill(String(mm));
		await expect(panel(page)).toContainText(`${mm} mm`);
	}
	/** A box seen from above with the brush chosen (filament 2, a 6 mm circle brush: about 8 pixels either side of the pointer). */
	async function readyBrush(page: Page) {
		await ready(page);
		await tool(page, 'Brush').check();
		await expect(size(page)).toHaveValue('6');
	}

	test('shows its shapes and size once chosen, with a ring on the shape under the pointer the size of the brush', async ({ page }) => {
		await ready(page);
		await expect(panel(page).getByLabel('Brush size')).toHaveCount(0);
		await tool(page, 'Brush').check();
		for (const shape of ['Circle', 'Sphere', 'Triangles']) await expect(tool(page, shape)).toBeVisible();
		await expect(tool(page, 'Circle')).toBeChecked();
		const { x, y } = await centre(page);
		await page.mouse.move(x, y);
		const ring = page.getByTestId('brush-cursor');
		await expect(ring).toBeVisible();
		const small = Number(await ring.getAttribute('data-radius'));
		await setSize(page, 12);
		await page.mouse.move(x + 1, y);
		await expect.poll(async () => Number(await ring.getAttribute('data-radius'))).toBeGreaterThan(small * 1.8);
		await tool(page, 'Triangles').check();
		await expect(ring).toHaveCount(0); // a triangle brush has no radius to show
	});

	test('a drag paints a band under the brush and nothing further away; one undo takes the whole stroke back', async ({ page }) => {
		await readyBrush(page);
		await stroke(page, [-18, 0], [18, 0]);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await expect.poll(async () => isTeal(await colourAtCentre(page, 14, 0))).toBe(true);
		expect(isOrange(await colourAtCentre(page, 0, 18))).toBe(true); // 18 px is about 6.5 mm away from a 3 mm brush
		expect(isOrange(await colourAtCentre(page, 0, -18))).toBe(true);
		await page.keyboard.press('Control+z');
		await expect.poll(async () => isOrange(await colourAtCentre(page))).toBe(true);
		await expect.poll(async () => isOrange(await colourAtCentre(page, 14, 0))).toBe(true);
	});

	test('a plain click puts one round dab down', async ({ page }) => {
		await readyBrush(page);
		const { x, y } = await centre(page);
		await page.mouse.click(x - 10, y);
		await page.mouse.move(x + 200, y + 150);
		await expect.poll(async () => isTeal(await colourAtCentre(page, -10, 0))).toBe(true);
		expect(isOrange(await colourAtCentre(page, 10, 0))).toBe(true);
	});

	test('a bigger brush paints a wider band', async ({ page }) => {
		await readyBrush(page);
		await setSize(page, 20);
		await stroke(page, [-18, 0], [18, 0]);
		await expect.poll(async () => isTeal(await colourAtCentre(page, 0, 18))).toBe(true); // 10 mm radius is about 27 px
	});

	test('Shift erases with the brush', async ({ page }) => {
		await readyBrush(page);
		await setSize(page, 20);
		await stroke(page, [-20, 0], [20, 0]);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await setSize(page, 6);
		await stroke(page, [-10, 0], [10, 0], true);
		await expect.poll(async () => isOrange(await colourAtCentre(page))).toBe(true);
		expect(isTeal(await colourAtCentre(page, 0, 18))).toBe(true); // the rest of the band is still there
	});

	test('a left drag paints and does not orbit, while a right drag still turns the view', async ({ page }) => {
		await readyBrush(page);
		const before = await page.getByTestId('viewport').getAttribute('data-azimuth');
		await stroke(page, [-18, 0], [18, 0]);
		expect(await page.getByTestId('viewport').getAttribute('data-azimuth')).toBe(before);
		const { x, y } = await centre(page);
		await page.mouse.move(x, y + 60);
		await page.mouse.down({ button: 'right' });
		await page.mouse.move(x + 60, y + 60, { steps: 8 });
		await page.mouse.up({ button: 'right' });
		expect(await page.getByTestId('viewport').getAttribute('data-azimuth')).not.toBe(before);
	});

	test('Ctrl+wheel changes the brush size', async ({ page }) => {
		await readyBrush(page);
		const { x, y } = await centre(page);
		await page.mouse.move(x, y);
		await page.keyboard.down('Control');
		await page.mouse.wheel(0, -100);
		await page.keyboard.up('Control');
		await expect.poll(async () => Number(await size(page).inputValue())).toBeGreaterThan(6);
	});

	test('the 3MF for OrcaSlicer has the brush’s triangles painted, more than a face and fewer than all of them', async ({ page }) => {
		await readyBrush(page);
		await stroke(page, [-18, 0], [18, 0]);
		await expect.poll(async () => isTeal(await colourAtCentre(page))).toBe(true);
		await panel(page).getByRole('button', { name: 'Done' }).click();
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 30_000 }),
			page.getByRole('menuitem', { name: 'Export as 3MF for OrcaSlicer' }).click(),
		]);
		const model = read3mf(await readFile(await download.path()))['3D/3dmodel.model']!;
		const painted = model.match(/paint_color="8"/g)?.length ?? 0;
		const all = model.match(/<triangle /g)?.length ?? 0;
		expect(painted).toBeGreaterThan(20);
		expect(all).toBeGreaterThan(painted + 10);
	});
});
