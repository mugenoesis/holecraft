import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { addAtOrigin, center, newDesign, pixelAt, selectView, viewport } from './helpers.ts';

/*
 * X-ray: a view switch (not part of the design). From straight above, the default zoom is about 2.7 px per mm, so a 20 mm box is +-27 px across.
 * The box top is orange (little blue); the workplane is pale (a lot of blue). See-through lets the plane show through, and a cut across x takes
 * the right half of the box off.
 */

const xrayButton = (page: Page) => page.getByRole('button', { name: 'X-ray', exact: true });
const bar = (page: Page) => page.getByRole('group', { name: 'X-ray' });

async function blueAt(page: Page, dx: number, dy: number) {
	const { x, y } = await center(viewport(page));
	return (await pixelAt(page, x + dx, y + dy))[2]!;
}

async function boxFromAbove(page: Page) {
	await addAtOrigin(page, 'Box');
	await selectView(page, 'top');
	await page.keyboard.press('Escape'); // a selected shape is tinted
	await expect.poll(() => blueAt(page, 0, 0)).toBeLessThan(120);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('X-ray', () => {
	test('is off at the start, and the button shows and hides its controls', async ({ page }) => {
		await expect(xrayButton(page)).toHaveAttribute('aria-pressed', 'false');
		await expect(bar(page)).toBeHidden();
		await xrayButton(page).click();
		await expect(xrayButton(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(bar(page)).toBeVisible();
		await expect(bar(page).getByLabel('See through')).toBeChecked();
		await xrayButton(page).click();
		await expect(bar(page)).toBeHidden();
	});

	test('see-through lets the workplane show through a solid, and turning it off makes the solid solid again', async ({ page }) => {
		await boxFromAbove(page);
		const solid = await blueAt(page, 0, 0);
		await xrayButton(page).click();
		await expect.poll(() => blueAt(page, 0, 0)).toBeGreaterThan(solid + 25);
		await bar(page).getByLabel('See through').uncheck();
		await expect.poll(() => blueAt(page, 0, 0)).toBeLessThan(120);
		await bar(page).getByLabel('See through').check();
		await xrayButton(page).click();
		await expect.poll(() => blueAt(page, 0, 0)).toBeLessThan(120);
	});

	test('a cut across x takes off one half of the box, and a slider moves it', async ({ page }) => {
		await boxFromAbove(page);
		await xrayButton(page).click();
		await bar(page).getByLabel('See through').uncheck();
		await bar(page).getByLabel('Cut across').selectOption('x');
		const slider = bar(page).getByRole('slider', { name: 'Cut position' });
		await expect(slider).toBeVisible();
		await expect(bar(page).locator('output')).toHaveText('10 mm'); // starts at the far end: nothing cut yet
		await expect.poll(() => blueAt(page, 13, 0)).toBeLessThan(120);
		await slider.fill('0');
		await expect(bar(page).locator('output')).toHaveText('0 mm');
		await expect.poll(() => blueAt(page, 13, 0)).toBeGreaterThan(150); // the right half is gone: the workplane
		await expect.poll(() => blueAt(page, -13, 0)).toBeLessThan(140); // the left half is still there
		await bar(page).getByLabel('Cut across').selectOption('');
		await expect.poll(() => blueAt(page, 13, 0)).toBeLessThan(120);
	});

	test('does not change the design, and its controls pass the accessibility scan', async ({ page }) => {
		await addAtOrigin(page, 'Box');
		await xrayButton(page).click();
		await bar(page).getByLabel('Cut across').selectOption('z');
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
		expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
		await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); // only the adding of the box, not an X-ray step
		await page.keyboard.press('Control+z');
		await expect(page.getByTestId('object-list').locator('li')).toHaveCount(0);
	});
});
