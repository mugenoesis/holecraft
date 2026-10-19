import { expect, type Page, test } from '@playwright/test';
import {
	addAtOrigin,
	cameraSettled,
	center,
	dropShape,
	field,
	newDesign,
	pixelAt,
	properties,
	selectedNames,
	selectView,
	viewport,
} from './helpers.ts';

/*
 * These tests look at real pixels. From straight above, a box with a hole cut through it shows the
 * pale workplane through the hole, while an uncut box is solid orange all the way across. The
 * orange box top has little blue in it (blue < 120) and the workplane has a lot (blue > 150).
 */

const groupButton = (page: Page) => page.getByRole('button', { name: 'Group', exact: true });
const ungroupButton = (page: Page) => page.getByRole('button', { name: 'Ungroup', exact: true });
const typeButton = (page: Page, name: 'Solid' | 'Hole') => properties(page).getByRole('button', { name, exact: true });
const list = (page: Page) => page.getByTestId('object-list');

/**
 * Pixels from the centre of the view, in the top view at the default zoom (about 2.7 px per mm):
 * the box is ±27 px across and the hole ±13 px. So HOLE is inside the hole, and BOX is on the
 * box beside it.
 */
const HOLE = { dx: 3, dy: 3 };
const BOX = { dx: 20, dy: 0 };
const PX_PER_10MM = 27;

async function sample(page: Page, dx: number, dy: number) {
	const { x, y } = await center(viewport(page));
	return pixelAt(page, x + dx, y + dy);
}

const blue = async (page: Page, spot: { dx: number; dy: number }) => (await sample(page, spot.dx, spot.dy))[2];

async function setSize(page: Page, width: number, depth: number, height: number) {
	for (const [name, value] of [
		['Width', width],
		['Depth', depth],
		['Height', height],
	] as const) {
		await field(page, name).fill(String(value));
		await field(page, name).press('Enter');
		await expect(field(page, name)).toHaveValue(String(value));
	}
	// Leave the field, or keyboard shortcuts like Ctrl+A would act on its text instead of the shapes.
	await page.getByRole('heading', { name: 'Objects' }).click();
}

/** A 20 mm box at the origin and a thin cylinder through it, looked at from above. Nothing is grouped yet. */
async function boxAndCylinder(page: Page, opts: { hole?: boolean } = {}) {
	await dropShape(page, 'Box');
	await addAtOrigin(page, 'Cylinder');
	await list(page)
		.getByRole('button', { name: /Cylinder 1/ })
		.click();
	await setSize(page, 10, 10, 40);
	if (opts.hole !== false) await typeButton(page, 'Hole').click();
	await selectView(page, 'top');
	await cameraSettled(page);
}

async function group(page: Page) {
	await page.keyboard.press('Control+a');
	await groupButton(page).click();
	await page.keyboard.press('Escape'); // so the selection tint doesn't colour what we sample
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('cutting holes', () => {
	test('before grouping, a hole is only a ghost: the box is not cut', async ({ page }) => {
		await boxAndCylinder(page);
		await page.keyboard.press('Escape');
		expect(await blue(page, HOLE)).toBeLessThan(150);
		expect(await blue(page, BOX)).toBeLessThan(120);
	});

	test('grouping a solid with a hole cuts the hole out of it', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		// The rest of the box is untouched.
		expect(await blue(page, BOX)).toBeLessThan(120);
	});

	test('a solid cylinder grouped with the box does not cut anything', async ({ page }) => {
		await boxAndCylinder(page, { hole: false });
		await group(page);
		// Wait long enough for a result to have arrived, then check nothing was cut.
		await page.waitForTimeout(2500);
		expect(await blue(page, HOLE)).toBeLessThan(150);
		expect(await blue(page, BOX)).toBeLessThan(120);
	});

	test('ungrouping puts the ghost back and fills the box in again', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		await list(page)
			.getByRole('button', { name: /Group 1/ })
			.click();
		await ungroupButton(page).click();
		await page.keyboard.press('Escape');
		await expect.poll(() => blue(page, HOLE)).toBeLessThan(150);
	});

	test('undo takes the cut away, and redo brings it back', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => blue(page, HOLE)).toBeLessThan(150);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
	});

	test('turning the hole into a solid fills the cut', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		// Open the group, make the cylinder solid, and group again.
		await list(page)
			.getByRole('button', { name: /Group 1/ })
			.click();
		await ungroupButton(page).click();
		await list(page)
			.getByRole('button', { name: /Cylinder 1/ })
			.click();
		await typeButton(page, 'Solid').click();
		await page.keyboard.press('Control+a');
		await groupButton(page).click();
		await page.keyboard.press('Escape');
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeLessThan(150);
	});
});

test.describe('a group that has been cut', () => {
	test('picks where there is material and not through the hole', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);

		// A selected group has resize and rotate handles over the view, so deselect before probing with clicks.
		await page.keyboard.press('Escape');
		const { x, y } = await center(viewport(page));
		await page.mouse.click(x + BOX.dx, y + BOX.dy);
		expect(await selectedNames(page)).toEqual(['Group 1']);

		await page.keyboard.press('Escape');
		await page.mouse.click(x + HOLE.dx, y + HOLE.dy);
		expect(await selectedNames(page)).toEqual([]);
	});

	test('moves with its cut', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await page.keyboard.press('Shift+ArrowRight'); // 10 mm to the right
		await page.keyboard.press('Escape');
		// The hole is now 10 mm to the right of where it was...
		await expect.poll(() => blue(page, { dx: PX_PER_10MM + 3, dy: 3 }), { timeout: 15_000 }).toBeGreaterThan(150);
		// ...and where it used to be is now solid box again (the box's left edge is now at the old middle).
		expect(await blue(page, { dx: 8, dy: 3 })).toBeLessThan(120);
	});

	test("takes the group's colour", async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await field(page, 'Color').fill('#00cc44');
		await page.keyboard.press('Escape');
		await expect
			.poll(async () => {
				const [r, g] = await sample(page, BOX.dx, BOX.dy);
				return g > 120 && r < 80;
			})
			.toBe(true);
	});

	test('disappears completely when the holes cut all of it away', async ({ page }) => {
		await dropShape(page, 'Box');
		await addAtOrigin(page, 'Box');
		await list(page).getByRole('button', { name: /Box 2/ }).click();
		await setSize(page, 100, 100, 100);
		await typeButton(page, 'Hole').click();
		await selectView(page, 'top');
		await cameraSettled(page);
		await group(page);
		await expect.poll(() => blue(page, BOX), { timeout: 15_000 }).toBeGreaterThan(150);
		// It is still in the list, it just has no material left.
		await expect(page.getByText('Objects: 1')).toBeVisible();
		const { x, y } = await center(viewport(page));
		await page.mouse.click(x + BOX.dx, y);
		expect(await selectedNames(page)).toEqual([]);
	});

	test('nothing is lost: ungrouping after a cut gives back both shapes', async ({ page }) => {
		await boxAndCylinder(page);
		await group(page);
		await expect.poll(() => blue(page, HOLE), { timeout: 15_000 }).toBeGreaterThan(150);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await ungroupButton(page).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		expect(await selectedNames(page)).toEqual(['Box 1', 'Cylinder 1']);
	});
});
