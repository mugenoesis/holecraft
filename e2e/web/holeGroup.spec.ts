import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, field, newDesign, pixelAt, properties, selectView, viewport } from './helpers.ts';

/*
 * A group turned into a hole is drawn as one ghost of its finished shape (what the cut will use), not as a ghost of every shape
 * it is made from. Checked by reading real pixels from above: the opening in a drilled block must show the bare floor.
 */

const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();
const list = (page: Page) => page.getByTestId('object-list');

async function setField(page: Page, name: string, value: string) {
	await field(page, name).fill(value);
	await field(page, name).press('Enter');
	await expect(field(page, name)).toHaveValue(value);
}

/** The brightness (r + g + b) of the pixel `mm` millimetres to the right of the view's centre, looking down (about 2.7 px per mm). */
async function brightnessAt(page: Page, mm: number) {
	const { x, y } = await center(viewport(page));
	const [r, g, b] = await pixelAt(page, x + mm * 2.7, y);
	return r + g + b;
}

/** A 20 mm block with a 6 mm hole right through it, grouped, with nothing selected, seen from above. */
async function drilledBlock(page: Page) {
	await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
	await page.getByRole('button', { name: 'Cylinder', exact: true }).press('Enter');
	await row(page, 1).click();
	await setField(page, 'Width', '6');
	await setField(page, 'Depth', '6');
	await setField(page, 'Height', '40');
	await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
	await page.getByRole('heading', { name: 'Objects' }).click();
	await page.keyboard.press('Control+a');
	await page.getByRole('button', { name: 'Group', exact: true }).click();
}

async function lookDown(page: Page) {
	await page.getByRole('heading', { name: 'Objects' }).click();
	await page.keyboard.press('Escape');
	await selectView(page, 'Top');
	await cameraSettled(page);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('a group that is a hole', () => {
	test('is one ghost of its finished shape: the opening through it shows the bare floor, brighter than the ghost around it', async ({
		page,
	}) => {
		await drilledBlock(page);
		await row(page, 0).click();
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await lookDown(page);
		// in the opening (the middle), and in the ghost of the block 6 mm out; the bare floor is brighter than the ghost over it
		await expect.poll(async () => (await brightnessAt(page, 0)) - (await brightnessAt(page, 6)), { timeout: 15_000 }).toBeGreaterThan(8);
	});

	test('goes back to a solid block when turned back to Solid', async ({ page }) => {
		await drilledBlock(page);
		await row(page, 0).click();
		const type = properties(page).getByRole('button', { name: 'Hole', exact: true });
		await type.click();
		await lookDown(page);
		await expect.poll(async () => (await brightnessAt(page, 0)) - (await brightnessAt(page, 6)), { timeout: 15_000 }).toBeGreaterThan(8);
		await row(page, 0).click();
		await properties(page).getByRole('button', { name: 'Solid', exact: true }).click();
		await lookDown(page);
		// solid again: the block (opaque, orange) beside the opening, the floor in the opening
		await expect.poll(async () => (await brightnessAt(page, 0)) - (await brightnessAt(page, 6)), { timeout: 15_000 }).toBeGreaterThan(150);
		await expect(list(page)).toContainText('Group 1');
	});
});
