import { expect, type Page, test } from '@playwright/test';
import { dropShape, field, newDesign, properties, selectedNames, uniqueName } from './helpers.ts';

/*
 * Saved shapes: a shape or group saved from Properties shows under the Mine chip of the Shapes panel, in every design, and adds like a
 * built-in shape. The library is shared by every test in a run, so each test saves under a name of its own and removes it again.
 */

const shapes = (page: Page) => page.getByRole('region', { name: 'Shapes' });
const mine = (page: Page) => shapes(page).getByRole('group', { name: 'Categories' }).getByRole('button', { name: 'Mine', exact: true });
const savedTile = (page: Page, name: string) => shapes(page).locator('.shape-tile', { hasText: name });
const saveButton = (page: Page) => properties(page).getByRole('button', { name: 'Save to library' });
const nameBox = (page: Page) => properties(page).getByRole('textbox', { name: 'Name in the library' });
const list = (page: Page) => page.getByTestId('object-list');
const made: string[] = [];

test.afterEach(async ({ request }) => {
	const all = (await (await request.get('/api/library')).json()) as { id: string; name: string }[];
	for (const item of all) if (made.includes(item.name)) await request.delete(`/api/library/${item.id}`);
	made.length = 0;
});

async function saveSelected(page: Page, name: string) {
	made.push(name);
	await saveButton(page).click();
	await nameBox(page).fill(name);
	await properties(page).getByRole('button', { name: 'Save', exact: true }).click();
	await expect(properties(page).getByRole('status')).toContainText('Saved');
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('saving a shape to the library', () => {
	test('a selected shape gets a Save to library button, which asks for a name (the object’s own to start with)', async ({ page }) => {
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await expect(saveButton(page)).toBeVisible();
		await saveButton(page).click();
		await expect(nameBox(page)).toHaveValue('Box 1');
		await properties(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(nameBox(page)).toHaveCount(0);
		await expect(saveButton(page)).toBeVisible();
	});

	test('is off with several things selected, with a hint to group them', async ({ page }) => {
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a'); // dropping does not select
		await page.keyboard.press('Control+a');
		await expect(saveButton(page)).toHaveCount(0);
		await page.getByRole('button', { name: 'Group', exact: true }).click();
		await expect(saveButton(page)).toBeVisible();
	});

	test('saves under the name given, which then shows as a tile under Mine, with a note when nothing else is', async ({ page }) => {
		const name = uniqueName('Plate');
		await expect(shapes(page).locator('.shape-tile')).not.toHaveCount(0);
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await saveSelected(page, name);
		await mine(page).click();
		await expect(savedTile(page, name)).toBeVisible();
		await expect(mine(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(shapes(page).locator('.shape-tile', { hasText: 'Box' })).toHaveCount(0); // only saved shapes here
	});

	test('a blank name is refused and nothing is saved', async ({ page }) => {
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await saveButton(page).click();
		await nameBox(page).fill('   ');
		await expect(properties(page).getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	});
});

test.describe('using a saved shape', () => {
	test('clicking a tile adds a copy, named as saved, in this design and every other: a group comes with what is in it', async ({
		page,
	}) => {
		const name = uniqueName('Pair');
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a'); // dropping does not select
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();
		await saveSelected(page, name);

		await newDesign(page); // a different design: the library is shared
		await mine(page).click();
		await savedTile(page, name).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await expect(list(page).getByRole('button', { name: new RegExp(`^${name} `) })).toBeVisible();
		expect(await selectedNames(page)).toEqual([name]);
		await expect(properties(page)).toContainText('Contains 2 shapes');
		await savedTile(page, name).click(); // and again: a second copy
		await expect(page.getByText('Objects: 2')).toBeVisible();
	});

	test('keeps its colour, size and hole-ness as saved', async ({ page }) => {
		const name = uniqueName('Slot');
		await dropShape(page, 'Cylinder');
		await page.keyboard.press('Control+a'); // dropping does not select
		await field(page, 'Width').fill('7');
		await field(page, 'Width').press('Enter');
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await saveSelected(page, name);
		await page.getByRole('button', { name: 'Delete', exact: true }).click(); // gone from this design
		await mine(page).click();
		await savedTile(page, name).click();
		await expect(list(page).locator('li').first()).toHaveAttribute('data-mode', 'hole');
		await expect(field(page, 'Width')).toHaveValue('7');
	});

	test('can be dragged onto the workplane like a built-in shape', async ({ page }) => {
		const name = uniqueName('Drag');
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await saveSelected(page, name);
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await mine(page).click();
		await savedTile(page, name).dragTo(page.getByTestId('viewport'));
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('says what to do when nothing has been saved yet', async ({ page }) => {
		await mine(page).click();
		const tiles = await shapes(page).locator('.shape-tile').count();
		if (tiles === 0) await expect(shapes(page).getByRole('status')).toContainText('Nothing saved yet');
	});
});

test.describe('managing saved shapes', () => {
	const manage = (page: Page) => shapes(page).getByRole('checkbox', { name: 'Manage' });

	test('Manage shows rename and delete on each saved tile, and a rename keeps the tile', async ({ page }) => {
		const [name, renamed] = [uniqueName('Old'), uniqueName('New')];
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await saveSelected(page, name);
		await mine(page).click();
		await expect(savedTile(page, name).getByRole('button', { name: /^Rename/ })).toHaveCount(0);
		await manage(page).check();
		made.push(renamed);
		await savedTile(page, name)
			.getByRole('button', { name: /^Rename/ })
			.click();
		await shapes(page).getByRole('textbox', { name: 'New name' }).fill(renamed);
		await shapes(page).getByRole('textbox', { name: 'New name' }).press('Enter');
		await expect(savedTile(page, renamed)).toBeVisible();
		await expect(savedTile(page, name)).toHaveCount(0);
	});

	test('deleting takes two clicks (the second confirms), and the tile is gone for good', async ({ page }) => {
		const name = uniqueName('Gone');
		await dropShape(page, 'Box');
		await page.keyboard.press('Control+a'); // dropping does not select
		await saveSelected(page, name);
		await mine(page).click();
		await manage(page).check();
		await savedTile(page, name)
			.getByRole('button', { name: /^Delete/ })
			.click();
		await expect(savedTile(page, name)).toBeVisible(); // asked first
		await savedTile(page, name)
			.getByRole('button', { name: /^Really delete/ })
			.click();
		await expect(savedTile(page, name)).toHaveCount(0);
		await page.reload();
		await mine(page).click();
		await expect(savedTile(page, name)).toHaveCount(0);
	});
});
