import { expect, type Page, test } from '@playwright/test';
import { Fingers } from './fingers.ts';
import { cameraSettled, center, field, newDesign, openPanel, properties, selectView, uniqueName, viewport } from './helpers.ts';

/*
 * Placing a shape with the mouse: click a shape in the Shapes panel, a see-through ghost follows the pointer over the plate, and one
 * click puts it down there (then it is done). A finger just taps a shape to add it. The ghost is a three.js object, so the viewport says
 * what it is showing in its data-ghost attribute (read here, as the camera is).
 */

const tile = (page: Page, name: string) => page.getByRole('region', { name: 'Shapes' }).getByRole('button', { name, exact: true });
const objectsLine = (page: Page, n: number) => page.getByText(`Objects: ${n}`);

async function pointOnPlate(page: Page, dx: number, dy: number) {
	const { x, y } = await center(viewport(page));
	return { x: x + dx, y: y + dy };
}

/** Where the (only) shape of a design is: its X and Y fields, after selecting it. */
async function positionOfOnlyShape(page: Page): Promise<[string, string]> {
	await page.keyboard.press('Control+a');
	return [await field(page, 'X').inputValue(), await field(page, 'Y').inputValue()];
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('click a shape, then click the plate', () => {
	test('arms the shape, shows a ghost that follows the pointer, and one click puts it down where the pointer was', async ({ page }) => {
		const at = await pointOnPlate(page, 90, 40);
		await tile(page, 'Box').click();
		await expect(tile(page, 'Box')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('region', { name: 'Shapes' })).toContainText('Placing a Box: click the plane to put it down');
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/); // no ghost until the pointer is over the plate

		await page.mouse.move(at.x - 30, at.y - 30);
		await page.mouse.move(at.x, at.y, { steps: 4 });
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'box');
		await expect(objectsLine(page, 0)).toBeVisible(); // a ghost is not part of the design

		await page.mouse.click(at.x, at.y);
		await expect(objectsLine(page, 1)).toBeVisible();
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		await expect(tile(page, 'Box')).toHaveAttribute('aria-pressed', 'false');
	});

	test('puts the shape where a drag from the panel to the same spot would', async ({ page }) => {
		const at = await pointOnPlate(page, -110, 60);
		await tile(page, 'Cylinder').click();
		await page.mouse.move(at.x, at.y, { steps: 3 });
		await page.mouse.click(at.x, at.y);
		await expect(objectsLine(page, 1)).toBeVisible();
		const clicked = await positionOfOnlyShape(page);

		// the same spot by dragging, in a design of its own
		await newDesign(page);
		const box = await viewport(page).boundingBox();
		const target = { x: at.x - box!.x, y: at.y - box!.y };
		await tile(page, 'Cylinder').dragTo(viewport(page), { targetPosition: target });
		await expect(objectsLine(page, 1)).toBeVisible();
		expect(await positionOfOnlyShape(page)).toEqual(clicked);
	});

	test('stops after one placement: the next click on the plate adds nothing', async ({ page }) => {
		const at = await pointOnPlate(page, 40, 20);
		await tile(page, 'Box').click();
		await page.mouse.move(at.x, at.y);
		await page.mouse.click(at.x, at.y);
		await expect(objectsLine(page, 1)).toBeVisible();
		const again = await pointOnPlate(page, -80, 10);
		await page.mouse.move(again.x, again.y);
		await page.mouse.click(again.x, again.y);
		await expect(objectsLine(page, 1)).toBeVisible();
	});

	test('Escape cancels it, and so does clicking the shape again or a right click', async ({ page }) => {
		const at = await pointOnPlate(page, 60, 30);
		await tile(page, 'Sphere').click();
		await page.mouse.move(at.x, at.y);
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'sphere');
		await page.keyboard.press('Escape');
		await expect(tile(page, 'Sphere')).toHaveAttribute('aria-pressed', 'false');
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		await page.mouse.click(at.x, at.y);
		await expect(objectsLine(page, 0)).toBeVisible();

		await tile(page, 'Sphere').click();
		await tile(page, 'Sphere').click(); // the second click lets go of it
		await expect(tile(page, 'Sphere')).toHaveAttribute('aria-pressed', 'false');

		await tile(page, 'Sphere').click();
		await page.mouse.move(at.x, at.y);
		await page.mouse.click(at.x, at.y, { button: 'right' });
		await expect(tile(page, 'Sphere')).toHaveAttribute('aria-pressed', 'false');
		await expect(objectsLine(page, 0)).toBeVisible();
	});

	test('choosing another shape swaps the ghost', async ({ page }) => {
		const at = await pointOnPlate(page, 60, 30);
		await tile(page, 'Box').click();
		await page.mouse.move(at.x, at.y);
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'box');
		await tile(page, 'Cone').click();
		await expect(tile(page, 'Box')).toHaveAttribute('aria-pressed', 'false');
		await page.mouse.move(at.x + 10, at.y + 5);
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'cone');
	});

	test('Enter on a shape still adds it at once (there is no pointer to aim with)', async ({ page }) => {
		await tile(page, 'Box').press('Enter');
		await expect(objectsLine(page, 1)).toBeVisible();
		await expect(tile(page, 'Box')).toHaveAttribute('aria-pressed', 'false');
	});

	test('dragging a shape from the panel still works', async ({ page }) => {
		await tile(page, 'Box').dragTo(viewport(page));
		await expect(objectsLine(page, 1)).toBeVisible();
	});
});

test.describe('over another shape', () => {
	/** A 20 mm box at the origin, seen from straight above, so the middle of the view is the middle of its top. */
	async function boxSeenFromAbove(page: Page) {
		await tile(page, 'Box').press('Enter');
		await selectView(page, 'Top');
		await cameraSettled(page);
		return pointOnPlate(page, 0, 0);
	}

	/** How high the base of the (only) cylinder is: its Z field, after selecting it in the Objects list. */
	async function heightOfCylinder(page: Page) {
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /^Cylinder/ })
			.click();
		return field(page, 'Z').inputValue();
	}

	test('the ghost stands on the top of it, and one click puts the shape there', async ({ page }) => {
		const over = await boxSeenFromAbove(page);
		await tile(page, 'Cylinder').click();
		await page.mouse.move(over.x, over.y, { steps: 3 });
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'cylinder');
		await page.mouse.click(over.x, over.y);
		await expect(objectsLine(page, 2)).toBeVisible();
		expect(await heightOfCylinder(page)).toBe('20'); // on top of the 20 mm box, not on the floor
	});

	test('a shape dragged from the panel onto the top of it stands on it too', async ({ page }) => {
		const over = await boxSeenFromAbove(page);
		const box = await viewport(page).boundingBox();
		await tile(page, 'Cylinder').dragTo(viewport(page), { targetPosition: { x: over.x - box!.x, y: over.y - box!.y } });
		await expect(objectsLine(page, 2)).toBeVisible();
		expect(await heightOfCylinder(page)).toBe('20');
	});

	test('over empty floor it still goes on the floor', async ({ page }) => {
		const over = await boxSeenFromAbove(page);
		await tile(page, 'Cylinder').click();
		const away = { x: over.x + 200, y: over.y + 120 };
		await page.mouse.move(away.x, away.y, { steps: 3 });
		await page.mouse.click(away.x, away.y);
		await expect(objectsLine(page, 2)).toBeVisible();
		expect(await heightOfCylinder(page)).toBe('0');
	});
});

test.describe('a saved shape is placed the same way', () => {
	const made: string[] = [];
	test.afterEach(async ({ request }) => {
		const all = (await (await request.get('/api/library')).json()) as { id: string; name: string }[];
		for (const item of all) if (made.includes(item.name)) await request.delete(`/api/library/${item.id}`);
		made.length = 0;
	});

	/** Saves a box to the library under a name of its own and shows the Mine view; returns the name. */
	async function saveABox(page: Page) {
		const name = uniqueName('Ghost test');
		made.push(name);
		await tile(page, 'Box').press('Enter');
		await page.keyboard.press('Control+a');
		await openPanel(page, 'Edit');
		await properties(page).getByRole('button', { name: 'Save to library' }).click();
		await properties(page).getByRole('textbox', { name: 'Name in the library' }).fill(name);
		await properties(page).getByRole('button', { name: 'Save', exact: true }).click();
		await expect(properties(page).getByRole('status')).toContainText('Saved');
		await openPanel(page, 'Shapes');
		await page.getByRole('group', { name: 'Categories' }).getByRole('button', { name: 'Mine', exact: true }).click();
		return name;
	}

	test('click it under Mine, see its ghost, click the plate', async ({ page }) => {
		const name = await saveABox(page);

		const saved = page.getByRole('region', { name: 'Shapes' }).locator('.shape-tile', { hasText: name });
		await saved.click();
		await expect(saved).toHaveAttribute('aria-pressed', 'true');
		const at = await pointOnPlate(page, 120, 50);
		await page.mouse.move(at.x, at.y, { steps: 3 });
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'saved');
		await page.mouse.click(at.x, at.y);
		await expect(objectsLine(page, 2)).toBeVisible();
		await expect(saved).toHaveAttribute('aria-pressed', 'false');
	});

	test.describe('with a finger', () => {
		test.use({ hasTouch: true });

		test('press and hold it under Mine, drag it onto the plate, and it is put down where the finger lifts', async ({ page }) => {
			const name = await saveABox(page);
			const fingers = await Fingers.on(page);
			const from = await center(page.getByRole('region', { name: 'Shapes' }).locator('.shape-tile', { hasText: name }));
			const to = await pointOnPlate(page, 100, 40);
			await fingers.down(from);
			await page.waitForTimeout(500);
			await fingers.moveTo(to);
			await expect(viewport(page)).toHaveAttribute('data-ghost', 'saved');
			await fingers.up();
			await expect(objectsLine(page, 2)).toBeVisible();
			await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		});
	});
});

test.describe('on a touch screen', () => {
	test.use({ hasTouch: true });

	const HOLD_MS = 500; // longer than the press-and-hold needs

	test('pressing and holding a shape, then dragging it onto the plate, shows its ghost and puts it down where the finger lifts', async ({
		page,
	}) => {
		await newDesign(page);
		await openPanel(page, 'Shapes');
		const fingers = await Fingers.on(page);
		const from = await center(tile(page, 'Box'));
		const to = await pointOnPlate(page, 80, 30);
		await fingers.down(from);
		await page.waitForTimeout(HOLD_MS);
		await fingers.moveTo(to);
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'box');
		await expect(objectsLine(page, 0)).toBeVisible();
		await fingers.up();
		await expect(objectsLine(page, 1)).toBeVisible();
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		await page.waitForTimeout(300);
		await expect(objectsLine(page, 1)).toBeVisible(); // the release is not also a tap on the tile
	});

	test('a quick swipe that starts on a shape lifts nothing', async ({ page }) => {
		await newDesign(page);
		await openPanel(page, 'Shapes');
		const fingers = await Fingers.on(page);
		const from = await center(tile(page, 'Box'));
		const to = await pointOnPlate(page, 80, 30);
		await fingers.drag([from], [to]);
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		await expect(objectsLine(page, 0)).toBeVisible();
	});

	test('lifting a shape and letting go over the panel puts nothing down', async ({ page }) => {
		await newDesign(page);
		await openPanel(page, 'Shapes');
		const fingers = await Fingers.on(page);
		const from = await center(tile(page, 'Box'));
		const to = await pointOnPlate(page, 80, 30);
		const back = await center(tile(page, 'Cone'));
		await fingers.down(from);
		await page.waitForTimeout(HOLD_MS);
		await fingers.moveTo(to);
		await expect(viewport(page)).toHaveAttribute('data-ghost', 'box');
		await fingers.moveTo(back);
		await fingers.up();
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		await expect(objectsLine(page, 0)).toBeVisible();
	});

	test('tapping a shape adds it straight away, with no ghost', async ({ page }) => {
		await newDesign(page);
		await page
			.getByRole('tab', { name: 'Shapes', exact: true })
			.tap()
			.catch(() => undefined);
		await tile(page, 'Box').tap();
		await expect(objectsLine(page, 1)).toBeVisible();
		await expect(viewport(page)).not.toHaveAttribute('data-ghost', /.+/);
		await expect(tile(page, 'Box')).toHaveAttribute('aria-pressed', 'false');
	});
});
