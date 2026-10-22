import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { addAtOrigin, newDesign } from './helpers.ts';

/*
 * Two tabs on one design: the second to save is told the design was changed somewhere else, and chooses between keeping its own version and
 * loading the other. Nothing is lost silently, and ordinary editing in one tab never asks.
 */

const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'This design was changed somewhere else' });
const status = (page: Page) => page.getByTestId('save-status');
const objects = (page: Page) => page.getByTestId('object-list').locator('li');

/** Waits until the server has the design with this many shapes (the top bar says "Saved" before a change is even noticed, so it cannot be trusted alone). */
async function savedWith(page: Page, count: number) {
	const id = page.url().split('/').pop();
	await expect
		.poll(async () => ((await (await page.request.get(`/api/designs/${id}`)).json()) as { roots: string[] }).roots.length)
		.toBe(count);
}

/** A design with a box in it, saved, open in a second tab of the same browser that has the same box. */
async function twoTabs(page: Page) {
	await newDesign(page);
	await addAtOrigin(page, 'Box');
	await savedWith(page, 1);
	const other = await page.context().newPage();
	await other.goto(page.url());
	await expect(objects(other)).toHaveCount(1);
	return other;
}

/** The other tab saves a cylinder; this one, which does not know, adds a sphere and is told about the clash. */
async function clash(page: Page, other: Page) {
	await addAtOrigin(other, 'Cylinder');
	await savedWith(other, 2);
	await addAtOrigin(page, 'Sphere');
	await expect(dialog(page)).toBeVisible();
}

test.describe('a design open in two tabs', () => {
	test('the tab that saves second is told, and the top bar says so', async ({ page }) => {
		const other = await twoTabs(page);
		await clash(page, other);
		await expect(status(page)).toHaveText('Changed elsewhere');
		await expect(dialog(page)).toContainText('Keep my version');
	});

	test('Keep my version saves this tab’s design over the other: after a reload it is what is there', async ({ page }) => {
		const other = await twoTabs(page);
		await clash(page, other);
		await dialog(page).getByRole('button', { name: 'Keep my version' }).click();
		await expect(dialog(page)).toBeHidden();
		await expect(status(page)).toHaveText('Saved');
		await page.reload();
		await expect(objects(page)).toHaveCount(2);
		await expect(page.getByTestId('object-list')).toContainText('Sphere 1');
		await expect(page.getByTestId('object-list')).not.toContainText('Cylinder 1');
	});

	test('Load the other version drops this tab’s unsaved change and shows what the other tab saved, and editing goes on as usual', async ({
		page,
	}) => {
		const other = await twoTabs(page);
		await clash(page, other);
		await dialog(page).getByRole('button', { name: 'Load the other version' }).click();
		await expect(objects(page)).toHaveCount(2);
		await expect(page.getByTestId('object-list')).toContainText('Cylinder 1');
		await expect(page.getByTestId('object-list')).not.toContainText('Sphere 1');
		await expect(dialog(page)).toBeHidden();
		await addAtOrigin(page, 'Sphere');
		await expect(status(page)).toHaveText('Saved');
		await expect(dialog(page)).toBeHidden();
	});

	test('a design renamed from somewhere else counts as changed too', async ({ page, request }) => {
		await newDesign(page);
		await addAtOrigin(page, 'Box');
		await savedWith(page, 1);
		const id = page.url().split('/').pop();
		expect((await request.patch(`/api/designs/${id}`, { data: { name: 'Renamed elsewhere' } })).ok()).toBe(true);
		await addAtOrigin(page, 'Sphere');
		await expect(dialog(page)).toBeVisible();
	});

	test('ordinary editing in one tab never asks (not even after its picture was kept)', async ({ page }) => {
		await newDesign(page);
		for (const [i, shape] of ['Box', 'Sphere', 'Cylinder'].entries()) {
			await addAtOrigin(page, shape);
			await savedWith(page, i + 1);
			await page.waitForTimeout(3000); // the designs list picture is made and kept a couple of seconds after a save
		}
		await expect(dialog(page)).toBeHidden();
		await expect(objects(page)).toHaveCount(3);
	});

	test('the question passes the accessibility scan', async ({ page }) => {
		const other = await twoTabs(page);
		await clash(page, other);
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
		expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
	});
});
