import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, field, newDesign, pixelAt, properties, selectView, viewport } from './helpers.ts';

/*
 * Chamfers on boxes and cylinders. The pixel tests look at a 20 mm box from the front at the default zoom (about 2.7 px
 * per mm), where its top corners are about 27 px either side of the centre and 54 px above it.
 */
const TOP_CORNER = { dx: 24, dy: -51 }; // about 1 mm inside the box's top right corner
const TOP_MIDDLE = { dx: 0, dy: -45 };

const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();

async function blueAt(page: Page, spot: { dx: number; dy: number }) {
	const { x, y } = await center(viewport(page));
	return (await pixelAt(page, x + spot.dx, y + spot.dy))[2];
}

async function setChamfer(page: Page, size: number) {
	await field(page, 'Chamfer').fill(String(size));
	await field(page, 'Chamfer').press('Enter');
	await expect(field(page, 'Chamfer')).toHaveValue(String(size));
}

/** Deselects (handles and the selection tint would sit on the pixels being read) and looks from the front. */
async function lookFromFront(page: Page) {
	await page.getByRole('heading', { name: 'Objects' }).click();
	await page.keyboard.press('Escape');
	await selectView(page, 'Front');
	await cameraSettled(page);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('chamfer', () => {
	test('boxes and cylinders have a Chamfer field; spheres do not', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Cylinder', 150, 0);
		await dropShape(page, 'Sphere', -150, 0);
		await row(page, 0).click();
		await expect(field(page, 'Chamfer')).toHaveValue('0');
		await row(page, 1).click();
		await expect(field(page, 'Chamfer')).toHaveValue('0');
		await row(page, 2).click();
		await expect(field(page, 'Chamfer')).toHaveCount(0);
	});

	test('the edge choice appears once there is a chamfer, and a chamfer too big for the shape says so', async ({ page }) => {
		await dropShape(page, 'Box');
		await row(page, 0).click();
		const edges = properties(page).getByRole('group', { name: 'Chamfer edges' });
		await expect(edges).toHaveCount(0);
		await setChamfer(page, 2);
		await expect(edges.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
		await edges.getByRole('button', { name: 'Top' }).click();
		await expect(edges.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('chamfer-limited')).toHaveCount(0);
		await setChamfer(page, 50); // the box is 20 mm
		await expect(page.getByTestId('chamfer-limited')).toContainText('Limited to');
	});

	test('a chamfer cuts the corners off a box (seen from the front), and undo puts them back', async ({ page }) => {
		await dropShape(page, 'Box');
		await lookFromFront(page);
		await expect.poll(() => blueAt(page, TOP_CORNER)).toBeLessThan(150); // the orange box

		await row(page, 0).click();
		await setChamfer(page, 6);
		await lookFromFront(page);
		await expect.poll(() => blueAt(page, TOP_CORNER)).toBeGreaterThan(150); // the pale background shows through
		expect(await blueAt(page, TOP_MIDDLE)).toBeLessThan(150); // the rest of the box is still there

		await page.keyboard.press('Control+z');
		await expect.poll(() => blueAt(page, TOP_CORNER)).toBeLessThan(150);
	});

	test('a chamfer on the bottom edges leaves the top corners square', async ({ page }) => {
		await dropShape(page, 'Box');
		await row(page, 0).click();
		await setChamfer(page, 6);
		await properties(page).getByRole('group', { name: 'Chamfer edges' }).getByRole('button', { name: 'Bottom' }).click();
		await lookFromFront(page);
		await expect.poll(() => blueAt(page, TOP_CORNER)).toBeLessThan(150);
		await expect.poll(() => blueAt(page, { dx: TOP_CORNER.dx, dy: -3 })).toBeGreaterThan(150); // its bottom corner is cut
	});
});
