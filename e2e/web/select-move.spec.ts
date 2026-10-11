import { expect, type Page, test } from '@playwright/test';
import { camera, center, drag, dropShape, newDesign, objects, selectedNames, viewport } from './helpers.ts';

const properties = (page: Page) => page.getByRole('region', { name: 'Properties' });
const field = (page: Page, name: string) => properties(page).getByLabel(name, { exact: true });

/** A point in the viewport, relative to its centre (the workplane origin at the home view). */
async function at(page: Page, dx = 0, dy = 0) {
	const { x, y } = await center(viewport(page));
	return { x: x + dx, y: y + dy };
}

async function click(page: Page, dx = 0, dy = 0, opts: { shift?: boolean } = {}) {
	const p = await at(page, dx, dy);
	if (opts.shift) await page.keyboard.down('Shift');
	await page.mouse.click(p.x, p.y);
	if (opts.shift) await page.keyboard.up('Shift');
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('selecting', () => {
	test('clicking a shape selects it and shows its properties', async ({ page }) => {
		await dropShape(page, 'Box');
		await expect(properties(page)).toContainText('Select a shape');
		await click(page);
		expect(await selectedNames(page)).toEqual(['Box 1']);
		await expect(field(page, 'Name')).toHaveValue('Box 1');
		await expect(field(page, 'X')).toHaveValue('0');
		await expect(field(page, 'Width')).toHaveValue('20');
	});

	test('clicking empty space clears the selection', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await click(page, -300, -150);
		expect(await selectedNames(page)).toEqual([]);
		await expect(properties(page)).toContainText('Select a shape');
	});

	test('shift-click adds and removes shapes from the selection', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await click(page);
		await click(page, 200, 0, { shift: true });
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
		await expect(properties(page)).toContainText('2 shapes selected');
		await click(page, 200, 0, { shift: true });
		expect(await selectedNames(page)).toEqual(['Box 1']);
	});

	test('shapes can be selected from the object list', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Sphere 1/ })
			.click();
		expect(await selectedNames(page)).toEqual(['Sphere 1']);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Box 1/ })
			.click({ modifiers: ['Shift'] });
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
	});

	test('clicking a row while several shapes are selected narrows the selection to that row', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Sphere 1/ })
			.click();
		expect(await selectedNames(page)).toEqual(['Sphere 1']);
	});

	test('a marquee drag selects the shapes it touches', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await dropShape(page, 'Cylinder', -200, 0);
		await drag(page, await at(page, -80, -120), await at(page, 280, 120));
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
	});

	test('shows the marquee while dragging and removes it afterwards', async ({ page }) => {
		await page.mouse.move(...(Object.values(await at(page, -100, -100)) as [number, number]));
		await page.mouse.down();
		await page.mouse.move(...(Object.values(await at(page, 100, 100)) as [number, number]), { steps: 5 });
		await expect(page.getByTestId('marquee')).toBeVisible();
		await page.mouse.up();
		await expect(page.getByTestId('marquee')).toHaveCount(0);
	});

	test('shift + marquee adds to the selection', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await click(page);
		await drag(page, await at(page, 120, -100), await at(page, 320, 100), { shift: true });
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
	});

	test('left-dragging empty space does not move the camera', async ({ page }) => {
		const before = await camera(page);
		await drag(page, await at(page, -300, -150), await at(page, -200, -100));
		expect(await camera(page)).toEqual(before);
	});

	test('Ctrl+A selects everything and Escape clears it', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
		await page.keyboard.press('Escape');
		expect(await selectedNames(page)).toEqual([]);
	});
});

test.describe('moving', () => {
	test('dragging a shape moves it, snapped to the grid', async ({ page }) => {
		await dropShape(page, 'Box');
		await drag(page, await at(page), await at(page, 100, 0));
		const [box] = await objects(page);
		expect(box!.x).toBeGreaterThan(20);
		expect(Number.isInteger(box!.x)).toBe(true);
		expect(Number.isInteger(box!.y)).toBe(true);
		expect(await selectedNames(page)).toEqual(['Box 1']);
	});

	test('dragging an unselected shape selects it first', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await click(page, 200, 0);
		const [, sphereBefore] = await objects(page);
		await drag(page, await at(page), await at(page, 0, 60));
		expect(await selectedNames(page)).toEqual(['Box 1']);
		const [box, sphere] = await objects(page);
		expect(box!.y).not.toBe(0);
		expect(sphere).toEqual(sphereBefore);
	});

	test('dragging one of several selected shapes moves them all together', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		const before = await objects(page);
		await drag(page, await at(page), await at(page, 0, 80));
		const after = await objects(page);
		const dy0 = after[0]!.y - before[0]!.y;
		expect(Math.abs(dy0)).toBeGreaterThan(10);
		expect(after[1]!.y - before[1]!.y).toBeCloseTo(dy0, 5);
		expect(after[1]!.x - before[1]!.x).toBeCloseTo(after[0]!.x - before[0]!.x, 5);
	});

	test('a shape cannot be dragged off the workplane', async ({ page }) => {
		await dropShape(page, 'Box');
		await drag(page, await at(page), await at(page, 480, -300), { steps: 12 });
		const [box] = await objects(page);
		expect(Math.abs(box!.x)).toBeLessThanOrEqual(100);
		expect(Math.abs(box!.y)).toBeLessThanOrEqual(100);
	});

	test('arrow keys nudge by the grid step, and Shift makes it ten times bigger', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await page.keyboard.press('ArrowRight');
		expect((await objects(page))[0]).toMatchObject({ x: 1, y: 0 });
		await page.keyboard.press('ArrowUp');
		expect((await objects(page))[0]).toMatchObject({ x: 1, y: 1 });
		await page.keyboard.press('Shift+ArrowLeft');
		expect((await objects(page))[0]).toMatchObject({ x: -9, y: 1 });
	});
});

test.describe('undo and redo', () => {
	const undo = (page: Page) => page.getByRole('button', { name: 'Undo' });
	const redo = (page: Page) => page.getByRole('button', { name: 'Redo' });

	test('start disabled', async ({ page }) => {
		await expect(undo(page)).toBeDisabled();
		await expect(redo(page)).toBeDisabled();
	});

	test('a whole drag undoes in one step, and redoes', async ({ page }) => {
		await dropShape(page, 'Box');
		await drag(page, await at(page), await at(page, 100, 40), { steps: 15 });
		const moved = (await objects(page))[0]!;
		expect(moved.x).not.toBe(0);

		await undo(page).click();
		expect((await objects(page))[0]).toMatchObject({ x: 0, y: 0 });
		await redo(page).click();
		expect((await objects(page))[0]).toMatchObject({ x: moved.x, y: moved.y });
	});

	test('adding a shape can be undone', async ({ page }) => {
		await dropShape(page, 'Box');
		await expect(undo(page)).toBeEnabled();
		await undo(page).click();
		await expect(page.getByText('Objects: 0')).toBeVisible();
		await redo(page).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('keyboard shortcuts: Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Control+z');
		expect((await objects(page))[0]!.x).toBe(0);
		await page.keyboard.press('Control+Shift+z');
		expect((await objects(page))[0]!.x).toBe(1);
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+y');
		expect((await objects(page))[0]!.x).toBe(1);
	});

	test('a new edit after undoing drops the redo history', async ({ page }) => {
		await dropShape(page, 'Box');
		await undo(page).click();
		await dropShape(page, 'Sphere');
		await expect(redo(page)).toBeDisabled();
	});

	test('undoing the creation of a selected shape clears the selection', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await undo(page).click();
		await expect(properties(page)).toContainText('Select a shape');
	});
});

test.describe('delete and duplicate', () => {
	test('Delete removes the selected shapes, and undo brings them back', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Delete');
		await expect(page.getByText('Objects: 0')).toBeVisible();
		await page.keyboard.press('Control+z');
		await expect(page.getByText('Objects: 2')).toBeVisible();
	});

	test('Backspace also deletes', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await page.keyboard.press('Backspace');
		await expect(page.getByText('Objects: 0')).toBeVisible();
	});

	test('the Delete button in the properties panel deletes', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await properties(page).getByRole('button', { name: 'Delete' }).click();
		await expect(page.getByText('Objects: 0')).toBeVisible();
	});

	test('Ctrl+D duplicates the selection, offset, and selects the copies', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await page.keyboard.press('Control+d');
		const list = await objects(page);
		expect(list.map((o) => o.name)).toEqual(['Box 1', 'Box 2']);
		expect(list[1]!.x).not.toBe(list[0]!.x);
		expect(await selectedNames(page)).toEqual(['Box 2']);
	});

	test('the Duplicate button duplicates', async ({ page }) => {
		await dropShape(page, 'Sphere');
		await click(page);
		await properties(page).getByRole('button', { name: 'Duplicate' }).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
	});

	test('delete and duplicate do nothing with an empty selection', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page, -300, -150);
		await page.keyboard.press('Delete');
		await page.keyboard.press('Control+d');
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});
});

test.describe('properties panel', () => {
	test('typing a position moves the shape, and undo reverts it', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await field(page, 'X').fill('25');
		await field(page, 'X').press('Enter');
		await field(page, 'Y').fill('-12.5');
		await field(page, 'Y').press('Enter');
		expect((await objects(page))[0]).toMatchObject({ x: 25, y: -12.5 });
		await page.getByRole('button', { name: 'Undo' }).click();
		expect((await objects(page))[0]).toMatchObject({ x: 25, y: 0 });
	});

	test('typing a size resizes the shape', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await field(page, 'Width').fill('40');
		await field(page, 'Width').press('Enter');
		await field(page, 'Height').fill('5');
		await field(page, 'Height').blur();
		await expect(field(page, 'Width')).toHaveValue('40');
		await expect(field(page, 'Depth')).toHaveValue('20');
		await expect(field(page, 'Height')).toHaveValue('5');
	});

	test('edits typed in quick succession are all kept', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		// Moving on to the next field right after Enter used to undo the previous edit when the
		// blur raced the re-render, so repeat it enough times to catch that reliably.
		for (let i = 1; i <= 12; i++) {
			await field(page, 'Width').fill(String(20 + i));
			await field(page, 'Width').press('Enter');
			await field(page, 'Height').fill(String(5 + i));
			await field(page, 'Height').blur();
			await expect(field(page, 'Width')).toHaveValue(String(20 + i));
			await expect(field(page, 'Height')).toHaveValue(String(5 + i));
		}
	});

	test('invalid sizes are rejected and the field reverts', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		for (const bad of ['-5', '0', '', '5000']) {
			await field(page, 'Width').fill(bad);
			await field(page, 'Width').press('Enter');
			await expect(field(page, 'Width')).toHaveValue('20');
		}
		await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); // only the add
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByText('Objects: 0')).toBeVisible();
	});

	test('renaming updates the object list', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await field(page, 'Name').fill('Base plate');
		await field(page, 'Name').press('Enter');
		expect((await objects(page))[0]!.name).toBe('Base plate');
	});

	test('changing the colour updates every selected shape', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await field(page, 'Color').fill('#ff0000');
		const rows = page.getByTestId('object-list').locator('li');
		await expect(rows.nth(0)).toHaveAttribute('data-color', '#ff0000');
		await expect(rows.nth(1)).toHaveAttribute('data-color', '#ff0000');
	});

	test('dragging updates the position fields live', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await drag(page, await at(page), await at(page, 100, 0));
		const [box] = await objects(page);
		await expect(field(page, 'X')).toHaveValue(String(box!.x));
	});

	test('keys typed into a field are not treated as shortcuts', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		const name = field(page, 'Name');
		await name.fill('abc');
		await name.press('Backspace');
		await name.press('f');
		await expect(name).toHaveValue('abf');
		await expect(page.getByText('Objects: 1')).toBeVisible();

		await field(page, 'X').focus();
		await page.keyboard.press('ArrowUp'); // steps the number, must not nudge the shape
		expect((await objects(page))[0]!.y).toBe(0);
	});
});
