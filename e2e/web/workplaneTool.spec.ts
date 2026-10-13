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

	test('clicking the front wall of a box makes new shapes stick out of it', async ({ page }) => {
		await dropShape(page, 'Box');
		await selectView(page, 'Front');
		await cameraSettled(page);
		await toolButton(page).click();
		await clickAt(page, 0, -27); // the middle of the front face: 10 mm up, about 2.7 px per mm
		await expect(floorButton(page)).toBeVisible();

		await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		await row(page, 1).click();
		// the cylinder's base is on the front face (y = -10, 10 mm up) and it is turned to point out of it (towards -y)
		await expect(field(page, 'X')).toHaveValue('0');
		await expect(field(page, 'Y')).toHaveValue('-10');
		await expect(field(page, 'Z')).toHaveValue('10');
		await expect(field(page, 'Rotate X')).toHaveValue('90');
		await expect(field(page, 'Rotate Y')).toHaveValue('0');
		await expect(field(page, 'Rotate Z')).toHaveValue('0');
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

/*
 * Stand on plane: an existing shape is put on the plane the Workplane tool chose, as a new one is.
 */
test.describe('stand on plane', () => {
	const standButton = (page: Page) => page.getByRole('region', { name: 'Arrange' }).getByRole('button', { name: 'Stand on plane' });

	test('is only offered while a plane is chosen, and goes away with the Floor button', async ({ page }) => {
		await boxFromAbove(page);
		await expect(standButton(page)).toHaveCount(0);
		await toolButton(page).click();
		await clickAt(page, 0);
		await expect(standButton(page)).toBeVisible();
		await floorButton(page).click();
		await expect(standButton(page)).toHaveCount(0);
	});

	test('puts the selected shape on the top of the box, keeping its place across, as one undo step', async ({ page }) => {
		await boxFromAbove(page);
		await page.getByRole('button', { name: 'Cylinder', exact: true }).click(); // on the floor, inside the box
		await toolButton(page).click();
		await clickAt(page, 0); // the box's top, 20 mm up
		await row(page, 1).click();
		await expect(field(page, 'Name')).toHaveValue('Cylinder 1');
		await expect(field(page, 'Z')).toHaveValue('0');
		await standButton(page).click();
		await expect(field(page, 'Z')).toHaveValue('20');
		await expect(field(page, 'X')).toHaveValue('0');
		await expect(field(page, 'Rotate X')).toHaveValue('0');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+z');
		await expect(field(page, 'Z')).toHaveValue('0');
	});

	test('puts it against a wall: base on the face and turned to point out of it', async ({ page }) => {
		await dropShape(page, 'Box');
		await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
		await selectView(page, 'Front');
		await cameraSettled(page);
		await toolButton(page).click();
		await clickAt(page, 0, -27); // the middle of the box's front face
		await row(page, 1).click();
		await standButton(page).click();
		await expect(field(page, 'Y')).toHaveValue('-10');
		await expect(field(page, 'Rotate X')).toHaveValue('90');
	});

	test('is off when nothing, or more than one thing, is selected', async ({ page }) => {
		await boxFromAbove(page);
		await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
		await toolButton(page).click();
		await clickAt(page, 0);
		await expect(standButton(page)).toBeDisabled(); // nothing selected
		await page.keyboard.press('Control+a');
		await expect(standButton(page)).toBeDisabled(); // both
		await row(page, 1).click();
		await expect(standButton(page)).toBeEnabled();
	});
});
