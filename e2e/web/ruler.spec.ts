import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, field, newDesign, selectedNames, selectView, viewport } from './helpers.ts';

const rulerButton = (page: Page) => page.getByRole('button', { name: 'Ruler', exact: true });
const readout = (page: Page) => page.getByTestId('ruler-readout');

async function clickAt(page: Page, dx: number, dy = 0) {
	const { x, y } = await center(viewport(page));
	await page.mouse.click(x + dx, y + dy);
}

async function hoverAt(page: Page, dx: number, dy = 0) {
	const { x, y } = await center(viewport(page));
	await page.mouse.move(x + dx, y + dy);
}

/** Top view, so pixels map to millimetres (about 2.7 px per mm at the default zoom). */
async function topView(page: Page) {
	await selectView(page, 'Top');
	await cameraSettled(page);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('ruler', () => {
	test('the Ruler button and the R key turn it on and off', async ({ page }) => {
		await expect(rulerButton(page)).toHaveAttribute('aria-pressed', 'false');
		await expect(readout(page)).toHaveCount(0);
		await rulerButton(page).click();
		await expect(rulerButton(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(readout(page)).toContainText('Click a face or the workplane');
		await page.keyboard.press('r');
		await expect(rulerButton(page)).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('r');
		await expect(readout(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(rulerButton(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('two clicks on the workplane measure the distance between them', async ({ page }) => {
		await topView(page);
		await rulerButton(page).click();
		await clickAt(page, -50);
		await hoverAt(page, 0); // the readout follows the pointer until the second click
		await expect(readout(page).locator('strong')).toHaveText(/^(1[0-9]|2[0-2]) mm$/);
		await clickAt(page, 50);
		// 100 px is about 37 mm, all of it along X
		await expect(readout(page).locator('strong')).toHaveText(/^(3[0-9]|4[0-5]) mm$/);
		await expect(readout(page)).toContainText('Y 0 mm');
		await expect(readout(page)).toContainText('Z 0 mm');
	});

	test('a click on the top of a box measures its height', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await rulerButton(page).click();
		await clickAt(page, 150); // on the bare workplane, beside the box
		await clickAt(page, 0); // on the box's top face, 20 mm up
		await expect(readout(page)).toContainText('Z 20 mm');
	});

	test('a third click starts a new measurement', async ({ page }) => {
		await topView(page);
		await rulerButton(page).click();
		await clickAt(page, -50);
		await clickAt(page, 50);
		await clickAt(page, 0, 40); // start over here
		await hoverAt(page, 60, 40);
		await expect(readout(page).locator('strong')).toHaveText(/^(2[0-4]) mm$/); // 60 px, not the 100 px of before
	});

	test('while measuring, clicking a shape does not select it, and the ruler changes nothing in the design', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await rulerButton(page).click();
		await clickAt(page, 0);
		await clickAt(page, 100);
		expect(await selectedNames(page)).toEqual([]);
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await rulerButton(page).click();
		await clickAt(page, 0);
		expect(await selectedNames(page)).toEqual(['Box 1']);
	});
});

/*
 * Snapping: within a few pixels of a sharp corner, an edge's middle or an edge, the ruler point jumps onto it exactly. A box 20 mm each way
 * seen from above is about 54 px across (2.7 px per mm), its top-face corners about 27 px from the middle of the view.
 */
test.describe('ruler snapping', () => {
	const marker = (page: Page) => page.getByTestId('ruler-snap');
	const snapBox = (page: Page) => readout(page).getByRole('checkbox', { name: /Snap/ });

	test.beforeEach(async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await rulerButton(page).click();
	});

	test('catches a corner a few pixels away and measures corner to corner exactly: 20 across and 20 deep is 28.28 mm', async ({ page }) => {
		await hoverAt(page, 31, 23);
		await expect(marker(page)).toHaveAttribute('data-kind', 'corner');
		await clickAt(page, 31, 23);
		await hoverAt(page, -31, -23);
		await expect(marker(page)).toHaveAttribute('data-kind', 'corner');
		await clickAt(page, -31, -23);
		await expect(readout(page).locator('strong')).toHaveText('28.28 mm');
		await expect(readout(page)).toContainText('X -20 mm');
		await expect(readout(page)).toContainText('Y 20 mm');
		await expect(readout(page)).toContainText('Z 0 mm');
	});

	test('with Snap switched off the same clicks only land near the corners, and nothing is marked', async ({ page }) => {
		await snapBox(page).uncheck();
		await hoverAt(page, 31, 23);
		await expect(marker(page)).toHaveCount(0);
		await clickAt(page, 31, 23);
		await clickAt(page, -31, -23);
		await expect(readout(page).locator('strong')).not.toHaveText('28.28 mm');
	});

	test('the middle of a long edge and the edge itself are caught too, each marked differently', async ({ page }) => {
		await page.keyboard.press('Escape'); // off, to widen the box
		await page.getByTestId('object-list').locator('li').first().locator('button').first().click();
		await field(page, 'Width').fill('100');
		await field(page, 'Width').press('Enter');
		await rulerButton(page).click();
		await hoverAt(page, 3, 30); // the middle of the front edge (the box is now 270 px wide)
		await expect(marker(page)).toHaveAttribute('data-kind', 'middle');
		await hoverAt(page, 80, 30); // further along the same edge
		await expect(marker(page)).toHaveAttribute('data-kind', 'edge');
		await hoverAt(page, 133, 29); // a corner
		await expect(marker(page)).toHaveAttribute('data-kind', 'corner');
		await hoverAt(page, 60, 0); // the middle of the top face, a long way from any edge
		await expect(marker(page)).toHaveCount(0);
	});

	test('is on to start, and the choice is remembered', async ({ page }) => {
		await expect(snapBox(page)).toBeChecked();
		await snapBox(page).uncheck();
		await page.getByText('Saved', { exact: true }).waitFor();
		await page.reload();
		await rulerButton(page).click();
		await expect(snapBox(page)).not.toBeChecked();
	});
});
