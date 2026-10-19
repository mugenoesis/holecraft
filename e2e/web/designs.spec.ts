import { expect, type Locator, type Page, test } from '@playwright/test';
import { createDesignViaApi, field, newDesign, objects, properties, selectedNames, uniqueName, viewport } from './helpers.ts';

const newButton = (page: Page) => page.getByRole('button', { name: 'New design' });
const card = (page: Page, name: string): Locator =>
	page.getByTestId('design-card').filter({ has: page.getByRole('link', { name, exact: true }) });
/** A card found by id, which still works while its name is swapped for a text box during a rename. */
const cardById = (page: Page, id: string): Locator => page.locator(`[data-design-id="${id}"]`);
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Design name' });
const saveStatus = (page: Page) => page.getByTestId('save-status');

async function waitSaved(page: Page) {
	await expect(saveStatus(page)).toHaveText('Saved', { timeout: 10_000 });
}

test.describe('the designs list', () => {
	test('shows a friendly message when there are no designs yet', async ({ page }) => {
		await page.route('**/api/designs', (route) => (route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.continue()));
		await page.goto('/');
		await expect(page.getByText('No designs yet')).toBeVisible();
		await expect(newButton(page)).toBeVisible();
	});

	test('lists designs, newest first, with how many objects each has', async ({ page, request }) => {
		const first = await createDesignViaApi(request, uniqueName('Older'));
		await new Promise((r) => setTimeout(r, 20));
		const second = await createDesignViaApi(request, uniqueName('Newer'));
		await page.goto('/');
		// allInnerTexts() does not wait, so make sure both cards have been drawn before reading the order.
		await expect(card(page, first.name)).toBeVisible();
		await expect(card(page, second.name)).toBeVisible();

		const names = await page.getByTestId('design-card').getByRole('link').allInnerTexts();
		expect(names.indexOf(second.name)).toBeGreaterThanOrEqual(0);
		expect(names.indexOf(second.name)).toBeLessThan(names.indexOf(first.name));
		await expect(card(page, first.name)).toContainText('0 objects');
		await expect(card(page, first.name)).toContainText(/just now|minutes? ago/);
	});

	test('New design makes a design and opens it at its own address', async ({ page }) => {
		await page.goto('/');
		await newButton(page).click();
		await expect(page).toHaveURL(/\/design\/[0-9a-f]{32}$/);
		await expect(viewport(page).locator('canvas')).toBeVisible();
		await expect(nameBox(page)).toHaveValue('Untitled design');
	});

	test('opens a design when its name is clicked', async ({ page, request }) => {
		const { name } = await createDesignViaApi(request, uniqueName('Gear'));
		await page.goto('/');
		await card(page, name).getByRole('link', { name, exact: true }).click();
		await expect(viewport(page).locator('canvas')).toBeVisible();
		await expect(nameBox(page)).toHaveValue(name);
	});

	test('renames a design in place', async ({ page, request }) => {
		const { id } = await createDesignViaApi(request, uniqueName('Before'));
		const renamed = uniqueName('After');
		await page.goto('/');
		await cardById(page, id)
			.getByRole('button', { name: /^Rename/ })
			.click();
		const box = cardById(page, id).getByRole('textbox', { name: 'Design name' });
		await box.fill(renamed);
		await box.press('Enter');
		await expect(card(page, renamed)).toBeVisible();
		await page.reload();
		await expect(card(page, renamed)).toBeVisible();
	});

	test('a blank name leaves the design as it was', async ({ page, request }) => {
		const { id, name } = await createDesignViaApi(request, uniqueName('Keep'));
		await page.goto('/');
		await cardById(page, id)
			.getByRole('button', { name: /^Rename/ })
			.click();
		const box = cardById(page, id).getByRole('textbox', { name: 'Design name' });
		await box.fill('   ');
		await box.press('Enter');
		await expect(card(page, name)).toBeVisible();
	});

	test('Escape cancels a rename', async ({ page, request }) => {
		const { id, name } = await createDesignViaApi(request, uniqueName('Stay'));
		await page.goto('/');
		await cardById(page, id)
			.getByRole('button', { name: /^Rename/ })
			.click();
		const box = cardById(page, id).getByRole('textbox', { name: 'Design name' });
		await box.fill('Something else');
		await box.press('Escape');
		await expect(card(page, name)).toBeVisible();
	});

	test('duplicates a design', async ({ page, request }) => {
		const { name } = await createDesignViaApi(request, uniqueName('Original'));
		await page.goto('/');
		await card(page, name)
			.getByRole('button', { name: /^Duplicate/ })
			.click();
		await expect(card(page, `Copy of ${name}`)).toBeVisible();
		await expect(card(page, name)).toBeVisible();
	});

	test('asks before deleting, and Cancel keeps the design', async ({ page, request }) => {
		const { name } = await createDesignViaApi(request, uniqueName('Precious'));
		await page.goto('/');
		await card(page, name)
			.getByRole('button', { name: /^Delete/ })
			.click();
		await expect(card(page, name)).toContainText('Delete this design?');
		await card(page, name).getByRole('button', { name: 'Cancel' }).click();
		await expect(card(page, name)).toBeVisible();
		await expect(card(page, name)).not.toContainText('Delete this design?');
	});

	test('deletes a design once confirmed, for good', async ({ page, request }) => {
		const { id, name } = await createDesignViaApi(request, uniqueName('Doomed'));
		await page.goto('/');
		await card(page, name)
			.getByRole('button', { name: /^Delete/ })
			.click();
		await card(page, name).getByRole('button', { name: 'Yes, delete' }).click();
		await expect(card(page, name)).toHaveCount(0);
		expect((await request.get(`/api/designs/${id}`)).status()).toBe(404);
	});

	test('explains when the server cannot be reached, and recovers on Retry', async ({ page }) => {
		await page.route('**/api/designs', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));
		await page.goto('/');
		await expect(page.getByRole('alert')).toContainText('Could not reach the server');
		await page.unroute('**/api/designs');
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(newButton(page)).toBeVisible();
	});
});

test.describe('saving', () => {
	test('autosaves, and the work is still there after a reload', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await waitSaved(page);
		await page.reload();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		expect((await objects(page))[0]!.name).toBe('Box 1');
	});

	test('shows that changes are waiting, then that they are saved', async ({ page }) => {
		await newDesign(page);
		await waitSaved(page);
		await page.getByRole('button', { name: 'Sphere', exact: true }).press('Enter');
		await expect(saveStatus(page)).toHaveText(/Unsaved changes|Saving…|Saved/);
		await waitSaved(page);
	});

	test('keeps sizes, colours, holes and groups across a reload', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await page.getByRole('button', { name: 'Sphere', exact: true }).press('Enter');
		const list = page.getByTestId('object-list');

		await list.getByRole('button', { name: /Box 1/ }).click();
		await field(page, 'Width').fill('33');
		await field(page, 'Width').press('Enter');
		await field(page, 'Color').fill('#123456');
		await list.getByRole('button', { name: /Sphere 1/ }).click();
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();
		await waitSaved(page);

		await page.reload();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await list.getByRole('button', { name: /Group 1/ }).click();
		await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
		await expect(list.locator('li').nth(0)).toHaveAttribute('data-color', '#123456');
		await expect(list.locator('li').nth(1)).toHaveAttribute('data-mode', 'hole');
		await list.getByRole('button', { name: /Box 1/ }).click();
		await expect(field(page, 'Width')).toHaveValue('33');
	});

	test('keeps position, rotation and height', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		for (const [label, value] of [
			['X', '12'],
			['Y', '-7'],
			['Z', '5'],
			['Rotate Z', '30'],
		] as const) {
			await field(page, label).fill(value);
			await field(page, label).press('Enter');
		}
		await waitSaved(page);
		await page.reload();
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		await expect(field(page, 'X')).toHaveValue('12');
		await expect(field(page, 'Y')).toHaveValue('-7');
		await expect(field(page, 'Z')).toHaveValue('5');
		await expect(field(page, 'Rotate Z')).toHaveValue('30');
	});

	test('does not keep the undo history across a reload', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await waitSaved(page);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
	});

	test('renaming the design in the editor saves it, and the list shows it', async ({ page }) => {
		const name = uniqueName('Bracket');
		await newDesign(page);
		await nameBox(page).fill(name);
		await nameBox(page).press('Enter');
		await waitSaved(page);
		await expect(page).toHaveTitle(`${name} – Holecraft`);
		await page.getByRole('link', { name: 'All designs' }).click();
		await expect(card(page, name)).toBeVisible();
	});

	test('the list waits for a slow save made on leaving, so it never shows the old name', async ({ page }) => {
		const name = uniqueName('Slow');
		await newDesign(page);
		await waitSaved(page);
		await page.route('**/api/designs/*', async (route) => {
			if (route.request().method() === 'PUT') await new Promise((r) => setTimeout(r, 1500));
			await route.continue();
		});
		await nameBox(page).fill(name);
		await nameBox(page).press('Enter');
		await page.getByRole('link', { name: 'All designs' }).click(); // before the autosave pause is up
		await expect(card(page, name)).toBeVisible();
	});

	test('going back to the list saves what was still waiting', async ({ page }) => {
		await newDesign(page);
		const url = page.url();
		await page.getByRole('button', { name: 'Cylinder', exact: true }).press('Enter');
		await page.getByRole('link', { name: 'All designs' }).click(); // straight away, before the pause is up
		await page.goto(url);
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('designs are independent of each other', async ({ page }) => {
		await newDesign(page);
		const first = page.url();
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await waitSaved(page);

		await newDesign(page);
		await expect(page.getByText('Objects: 0')).toBeVisible();
		await page.goto(first);
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('the browser back and forward buttons move between the list and a design', async ({ page }) => {
		await newDesign(page);
		await page.goBack();
		await expect(newButton(page)).toBeVisible();
		await page.goForward();
		await expect(viewport(page).locator('canvas')).toBeVisible();
	});
});

test.describe('when saving goes wrong', () => {
	test('says so, keeps the work on screen, and saves once the server is back', async ({ page }) => {
		await newDesign(page);
		await waitSaved(page);
		await page.route('**/api/designs/*', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));

		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await expect(saveStatus(page)).toContainText(/Couldn.t save/, { timeout: 10_000 });
		await expect(page.getByText('Objects: 1')).toBeVisible();

		await page.unroute('**/api/designs/*');
		await waitSaved(page); // the retry gets through
		await page.reload();
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('explains when the design was deleted elsewhere, and stops retrying', async ({ page, request }) => {
		await newDesign(page);
		await waitSaved(page);
		const id = page.url().split('/').pop()!;
		await request.delete(`/api/designs/${id}`);

		let puts = 0;
		await page.route('**/api/designs/*', (route) => {
			if (route.request().method() === 'PUT') puts++;
			return route.continue();
		});
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await expect(saveStatus(page)).toContainText(/no longer exists|not found/i, { timeout: 10_000 });
		const seen = puts;
		await page.waitForTimeout(3000);
		expect(puts).toBe(seen); // a deleted design is not retried
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('keeps shapes selected and editable while a save is failing', async ({ page }) => {
		await newDesign(page);
		await page.route('**/api/designs/*', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		expect(await selectedNames(page)).toEqual(['Box 1']);
		await field(page, 'Width').fill('44');
		await field(page, 'Width').press('Enter');
		await expect(field(page, 'Width')).toHaveValue('44');
	});
});
