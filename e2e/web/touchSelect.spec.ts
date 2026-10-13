import { expect, type Page, test } from '@playwright/test';
import { Fingers } from './fingers.ts';
import { camera, center, dropShape, newDesign, openPanel, selectedNames, viewport } from './helpers.ts';

/*
 * Selecting more than one object with a finger alone: a Select toggle in the view toolbar makes every tap add to (or take
 * from) the selection and lets a finger drawing on empty space draw the selection box. These use real touch events.
 */
test.use({ hasTouch: true });

const toggle = (page: Page) => page.getByRole('button', { name: 'Select', exact: true });
/** The selected names in order, read until they settle (a touch is handled a moment after it is sent). */
const selected = (page: Page) => async () => (await selectedNames(page)).sort();
const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();

/** A box on the left, a cylinder on the right and a sphere below, in the default view: tapping where each was dropped hits it. */
async function threeShapes(page: Page) {
	await newDesign(page);
	await dropShape(page, 'Box', -150, 0);
	await dropShape(page, 'Cylinder', 150, 0);
	await dropShape(page, 'Sphere', 0, 120);
	await openPanel(page, 'Objects'); // a touch screen has the compact layout, where the list is a tab of the panel
	await page.keyboard.press('Escape'); // nothing selected
	const c = await center(viewport(page));
	return { c, left: { x: c.x - 150, y: c.y }, right: { x: c.x + 150, y: c.y }, below: { x: c.x, y: c.y + 120 } };
}

test.describe('multi-select with a finger', () => {
	test('there is a Select toggle in the view toolbar, off to begin with', async ({ page }) => {
		await newDesign(page);
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
		await toggle(page).click();
		await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('without it a tap replaces the selection, as before', async ({ page }) => {
		const { left, right } = await threeShapes(page);
		const fingers = await Fingers.on(page);
		await fingers.tap(left);
		await fingers.tap(right);
		await expect.poll(selected(page)).toEqual(['Cylinder 1']);
	});

	test('with it on, each tap adds an object, and tapping a selected one takes it out again', async ({ page }) => {
		const { left, right, below } = await threeShapes(page);
		await toggle(page).click();
		const fingers = await Fingers.on(page);
		await fingers.tap(left);
		await fingers.tap(right);
		await expect.poll(selected(page)).toEqual(['Box 1', 'Cylinder 1']);
		await fingers.tap(below);
		await expect.poll(selected(page)).toEqual(['Box 1', 'Cylinder 1', 'Sphere 1']);
		await fingers.tap(right);
		await expect.poll(selected(page)).toEqual(['Box 1', 'Sphere 1']);
	});

	test('with it on, dragging a selected object does not move it (a drag is for the selection box)', async ({ page }) => {
		const { left } = await threeShapes(page);
		await toggle(page).click();
		const fingers = await Fingers.on(page);
		await fingers.tap(left);
		const listed = () => row(page, 0).innerText(); // "Box 1 (x, y)"
		const before = await listed();
		await fingers.drag([left], [{ x: left.x + 60, y: left.y + 40 }]);
		expect(await listed()).toBe(before);
	});

	test('with it on, a finger dragging on empty space draws a selection box that adds what it covers', async ({ page }) => {
		const { c, left, right } = await threeShapes(page);
		await toggle(page).click();
		const fingers = await Fingers.on(page);
		await fingers.tap(left);
		const before = await camera(page);
		// a box over the right-hand shape only, drawn from empty space above it
		await fingers.drag([{ x: right.x - 60, y: c.y - 90 }], [{ x: right.x + 60, y: c.y + 60 }]);
		await expect.poll(selected(page)).toEqual(['Box 1', 'Cylinder 1']);
		expect((await camera(page)).azimuth).toBeCloseTo(before.azimuth, 5); // it did not orbit
	});

	test('turned off again, a finger on empty space orbits as before', async ({ page }) => {
		const { c } = await threeShapes(page);
		await toggle(page).click();
		await toggle(page).click();
		const fingers = await Fingers.on(page);
		const before = await camera(page);
		await fingers.drag([{ x: c.x + 200, y: c.y + 200 }], [{ x: c.x + 260, y: c.y + 150 }]);
		await expect.poll(async () => (await camera(page)).azimuth).not.toBe(before.azimuth);
		await expect(page.getByTestId('marquee')).toHaveCount(0);
	});

	test('with it on, tapping rows in the Objects list adds them too', async ({ page }) => {
		await threeShapes(page);
		await toggle(page).click();
		await row(page, 0).click();
		await row(page, 2).click();
		await expect.poll(selected(page)).toEqual(['Box 1', 'Sphere 1']);
		await row(page, 0).click();
		await expect.poll(selected(page)).toEqual(['Sphere 1']);
	});

	test('Select all in the Objects list selects everything, without a keyboard', async ({ page }) => {
		await threeShapes(page);
		await page.getByRole('button', { name: 'Select all', exact: true }).click();
		await expect.poll(selected(page)).toEqual(['Box 1', 'Cylinder 1', 'Sphere 1']);
	});
});
