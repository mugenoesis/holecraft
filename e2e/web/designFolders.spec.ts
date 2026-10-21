import { expect, type Locator, type Page, test } from '@playwright/test';
import { createDesignViaApi, uniqueName } from './helpers.ts';

/*
 * Folders, sorting and search on the designs list. A folder is a name each design carries, so it exists while a design is in it. The list is
 * shared with every other test, so each test makes its own designs and folder (unique names) and finds only those.
 */

const card = (page: Page, name: string): Locator =>
	page.getByTestId('design-card').filter({ has: page.getByRole('link', { name, exact: true }) });
const group = (page: Page, folder: string): Locator => page.getByRole('region', { name: `Folder ${folder}` });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search designs' });
const sortBy = (page: Page) => page.getByRole('combobox', { name: 'Sort designs by' });

async function moveTo(page: Page, name: string, folder: string) {
	await card(page, name)
		.getByRole('combobox', { name: `Folder for ${name}` })
		.selectOption({ label: folder });
}

async function moveToNew(page: Page, name: string, folder: string) {
	await card(page, name)
		.getByRole('combobox', { name: `Folder for ${name}` })
		.selectOption({ label: 'New folder…' });
	const box = page.getByRole('textbox', { name: 'New folder name' });
	await box.fill(folder);
	await box.press('Enter');
}

/** Puts a design in a folder through the API, as the list would. */
async function inFolder(page: Page, id: string, folder: string) {
	const res = await page.request.patch(`/api/designs/${id}`, { data: { folder } });
	expect(res.status()).toBe(200);
}

test.describe('folders on the designs list', () => {
	test('a design is moved into a new folder and appears under its heading', async ({ page, request }) => {
		const folder = uniqueName('Printer parts');
		const d = await createDesignViaApi(request, uniqueName('Bracket'));
		await page.goto('/');
		await moveToNew(page, d.name, folder);
		await expect(group(page, folder).getByRole('heading', { name: folder })).toBeVisible();
		await expect(group(page, folder).getByTestId('design-card')).toHaveCount(1);
		await expect(group(page, folder).getByRole('link', { name: d.name, exact: true })).toBeVisible();
		await page.reload();
		await expect(group(page, folder).getByRole('link', { name: d.name, exact: true })).toBeVisible();
	});

	test('a design is moved to a folder that exists, and out of it again', async ({ page, request }) => {
		const folder = uniqueName('Home');
		const a = await createDesignViaApi(request, uniqueName('Lamp'));
		const b = await createDesignViaApi(request, uniqueName('Shelf'));
		await inFolder(page, a.id, folder);
		await page.goto('/');
		await moveTo(page, b.name, folder);
		await expect(group(page, folder).getByTestId('design-card')).toHaveCount(2);
		await moveTo(page, b.name, 'No folder');
		await expect(group(page, folder).getByTestId('design-card')).toHaveCount(1);
		await expect(card(page, b.name)).toBeVisible();
	});

	test('a folder folds to its heading and stays folded when the page is opened again', async ({ page, request }) => {
		const folder = uniqueName('Archive');
		const d = await createDesignViaApi(request, uniqueName('Old model'));
		await inFolder(page, d.id, folder);
		await page.goto('/');
		await expect(card(page, d.name)).toBeVisible();
		const toggle = page.getByRole('button', { name: `Collapse folder ${folder}` });
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await toggle.click();
		await expect(card(page, d.name)).toBeHidden();
		await expect(group(page, folder).getByRole('heading', { name: folder })).toBeVisible();
		await page.reload();
		await expect(page.getByRole('button', { name: `Expand folder ${folder}` })).toHaveAttribute('aria-expanded', 'false');
		await expect(card(page, d.name)).toBeHidden();
		await page.getByRole('button', { name: `Expand folder ${folder}` }).click();
		await expect(card(page, d.name)).toBeVisible();
	});

	test('a folder is renamed for everything in it, and taking it apart keeps the designs', async ({ page, request }) => {
		const folder = uniqueName('Old folder');
		const renamed = uniqueName('New folder');
		const d = await createDesignViaApi(request, uniqueName('Clip'));
		await inFolder(page, d.id, folder);
		await page.goto('/');
		await page.getByRole('button', { name: `Rename folder ${folder}` }).click();
		const box = page.getByRole('textbox', { name: 'Folder name' });
		await box.fill(renamed);
		await box.press('Enter');
		await expect(group(page, renamed).getByRole('link', { name: d.name, exact: true })).toBeVisible();
		await expect(group(page, folder)).toHaveCount(0);
		await page.getByRole('button', { name: `Remove folder ${renamed}` }).click();
		await page.getByRole('button', { name: 'Yes, remove the folder' }).click();
		await expect(group(page, renamed)).toHaveCount(0);
		await expect(card(page, d.name)).toBeVisible();
	});

	test('editing a design does not take it out of its folder', async ({ page, request }) => {
		const folder = uniqueName('Keep');
		const d = await createDesignViaApi(request, uniqueName('Part'));
		await inFolder(page, d.id, folder);
		await page.goto(`/design/${d.id}`);
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
		await page.goto('/');
		await expect(group(page, folder).getByRole('link', { name: d.name, exact: true })).toBeVisible();
	});

	test('a copy stays in the folder of the original', async ({ page, request }) => {
		const folder = uniqueName('Copies');
		const d = await createDesignViaApi(request, uniqueName('Gear'));
		await inFolder(page, d.id, folder);
		await page.goto('/');
		await page.getByRole('button', { name: `Duplicate ${d.name}` }).click();
		await expect(group(page, folder).getByTestId('design-card')).toHaveCount(2);
	});
});

test.describe('searching and sorting the designs list', () => {
	test('the search keeps the designs whose name or folder has every word', async ({ page, request }) => {
		const tag = uniqueName('zq');
		const folder = `${tag} Workshop`;
		const a = await createDesignViaApi(request, `${tag} Hinge`);
		const b = await createDesignViaApi(request, `${tag} Knob`);
		await inFolder(page, b.id, folder);
		await page.goto('/');
		await search(page).fill(`${tag} hinge`);
		await expect(card(page, a.name)).toBeVisible();
		await expect(card(page, b.name)).toBeHidden();
		await search(page).fill(`${tag} workshop`); // the folder's name
		await expect(card(page, b.name)).toBeVisible();
		await expect(card(page, a.name)).toBeHidden();
		await search(page).fill('nothing has this in its name qqq');
		await expect(page.getByText(/No designs match/)).toBeVisible();
		await search(page).fill('');
		await expect(card(page, a.name)).toBeVisible();
	});

	test('a match inside a folded folder is shown, and the folder folds back when the search is cleared', async ({ page, request }) => {
		const tag = uniqueName('zr');
		const folder = `${tag} Box`;
		const d = await createDesignViaApi(request, `${tag} Widget`);
		await inFolder(page, d.id, folder);
		await page.goto('/');
		await page.getByRole('button', { name: `Collapse folder ${folder}` }).click();
		await expect(card(page, d.name)).toBeHidden();
		await search(page).fill(`${tag} widget`);
		await expect(card(page, d.name)).toBeVisible();
		await search(page).fill('');
		await expect(card(page, d.name)).toBeHidden();
	});

	test('the order can be by name or by when it was made, and is kept when the page is opened again', async ({ page, request }) => {
		const tag = uniqueName('zs');
		const first = await createDesignViaApi(request, `${tag} B second`);
		await new Promise((r) => setTimeout(r, 20));
		const second = await createDesignViaApi(request, `${tag} A first`);
		await page.goto('/');
		await search(page).fill(tag);
		const names = () => page.getByTestId('design-card').getByRole('link').allInnerTexts();
		await expect.poll(names).toEqual([second.name, first.name]); // last changed: the newer one first
		await sortBy(page).selectOption('name');
		await expect.poll(names).toEqual([second.name, first.name]); // A before B
		await sortBy(page).selectOption('created');
		await expect.poll(names).toEqual([second.name, first.name]);
		await sortBy(page).selectOption('name');
		await page.reload();
		await expect(sortBy(page)).toHaveValue('name');
	});

	test('designs not in a folder come first, then each folder in order', async ({ page, request }) => {
		const tag = uniqueName('zt');
		const loose = await createDesignViaApi(request, `${tag} loose`);
		const inA = await createDesignViaApi(request, `${tag} in a`);
		const inB = await createDesignViaApi(request, `${tag} in b`);
		await inFolder(page, inB.id, `${tag} B folder`);
		await inFolder(page, inA.id, `${tag} A folder`);
		await page.goto('/');
		await search(page).fill(tag);
		const names = await page.getByTestId('design-card').getByRole('link').allInnerTexts();
		expect(names).toEqual([loose.name, inA.name, inB.name]);
	});
});

test.describe('a design list with folders: accessibility', () => {
	test('has no WCAG A or AA problems (axe)', async ({ page, request }) => {
		const AxeBuilder = (await import('@axe-core/playwright')).default;
		const folder = uniqueName('Scan');
		const d = await createDesignViaApi(request, uniqueName('Scanned'));
		await inFolder(page, d.id, folder);
		await page.goto('/');
		await expect(group(page, folder)).toBeVisible();
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
		expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
	});
});

test('opening a design from a folder works', async ({ page, request }) => {
	const folder = uniqueName('Open');
	const d = await createDesignViaApi(request, uniqueName('Openable'));
	await inFolder(page, d.id, folder);
	await page.goto('/');
	await group(page, folder).getByRole('link', { name: d.name, exact: true }).click();
	await expect(page).toHaveURL(new RegExp(`/design/${d.id}$`));
});
