import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, field, newDesign, selectView, viewport } from './helpers.ts';

const toolButton = (page: Page) => page.getByRole('button', { name: 'Workplane', exact: true });
const floorButton = (page: Page) => page.getByRole('button', { name: 'Back to the floor' });
const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();
const hint = (page: Page) => page.getByTestId('workplane-hint');

async function clickAt(page: Page, dx: number, dy = 0) {
	const { x, y } = await center(viewport(page));
	await page.mouse.click(x + dx, y + dy);
}

/** A box at the origin seen from above: its top is under the centre of the view, the bare floor beside it. */
async function boxFromAbove(page: Page) {
	await dropShape(page, 'Box');
	await selectView(page, 'Top');
	await cameraSettled(page);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('workplane tool', () => {
	test('the button and the W key turn it on and off, and Escape cancels', async ({ page }) => {
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false');
		await toolButton(page).click();
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(hint(page)).toContainText('Click a face to build on it');
		await page.keyboard.press('w');
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('w');
		await page.keyboard.press('Escape');
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('clicking the top of a box makes new shapes stand on it', async ({ page }) => {
		await boxFromAbove(page);
		await toolButton(page).click();
		await clickAt(page, 0); // the box's top, 20 mm up
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false'); // the tool is done
		await expect(floorButton(page)).toBeVisible();

		await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		await row(page, 1).click();
		await expect(field(page, 'Name')).toHaveValue('Cylinder 1');
		await expect(field(page, 'Z')).toHaveValue('20');
		await expect(page.getByText('Objects: 2')).toBeVisible();
	});

	test('the Floor button, or clicking the floor with the tool, goes back to building on the floor', async ({ page }) => {
		await boxFromAbove(page);
		await toolButton(page).click();
		await clickAt(page, 0);
		await floorButton(page).click();
		await expect(floorButton(page)).toHaveCount(0);
		await page.getByRole('button', { name: 'Sphere', exact: true }).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		await row(page, 1).click();
		await expect(field(page, 'Z')).toHaveValue('0');

		await toolButton(page).click();
		await clickAt(page, 0);
		await expect(floorButton(page)).toBeVisible();
		await toolButton(page).click();
		await clickAt(page, 200); // bare floor
		await expect(floorButton(page)).toHaveCount(0);
	});

	test('dropping a shape from the panel puts it on the chosen plane too', async ({ page }) => {
		await boxFromAbove(page);
		await toolButton(page).click();
		await clickAt(page, 0);
		const tile = page.getByRole('button', { name: 'Cylinder', exact: true });
		const { x, y } = await center(viewport(page));
		await tile.dragTo(viewport(page), { targetPosition: { x: x + 0, y: y + 0 } });
		await expect(page.getByText('Objects: 2')).toBeVisible();
		await row(page, 1).click();
		await expect(field(page, 'Z')).toHaveValue('20');
	});

	test('a plane is not saved: reopening the design builds on the floor', async ({ page }) => {
		await boxFromAbove(page);
		await toolButton(page).click();
		await clickAt(page, 0);
		await expect(floorButton(page)).toBeVisible();
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await expect(floorButton(page)).toHaveCount(0);
	});
});
