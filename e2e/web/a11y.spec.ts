import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { createDesignViaApi, newDesign, openPanel } from './helpers.ts';

/** The WCAG A and AA problems axe finds on the page as it is now, each as "rule: element" so a failure says what to fix. */
async function problems(page: Page): Promise<string[]> {
	const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
	return result.violations.flatMap((v) =>
		v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
	);
}

test.describe('accessibility (axe, WCAG A and AA)', () => {
	test('the designs list', async ({ page, request }) => {
		await createDesignViaApi(request);
		await page.goto('/');
		await expect(page.getByTestId('design-card').first()).toBeVisible();
		expect(await problems(page)).toEqual([]);
	});

	test('the editor', async ({ page }) => {
		await newDesign(page);
		expect(await problems(page)).toEqual([]);
	});

	test('the editor with a shape selected, on each panel tab', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: /^Box/ }).first().click();
		for (const tab of ['Shapes', 'Edit', 'Colours', 'Objects'] as const) {
			await openPanel(page, tab);
			expect(await problems(page), tab).toEqual([]);
		}
	});

	test('the shortcut sheet', async ({ page }) => {
		await newDesign(page);
		await page.keyboard.press('?');
		await expect(page.getByRole('dialog')).toBeVisible();
		expect(await problems(page)).toEqual([]);
	});

	test('the export menu with Send to Trident: the setup form, then the settings, and a message when sending failed', async ({
		page,
		request,
	}) => {
		await newDesign(page);
		await page.getByRole('button', { name: /^Box/ }).first().click();
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const menu = page.locator('.export-menu .menu');
		await expect(page.getByRole('menu', { name: 'Export format' })).toBeVisible();
		expect(await problems(page), 'the menu').toEqual([]);
		await menu.getByRole('menuitem', { name: /Send to Trident/ }).click();
		await expect(menu.getByLabel('Address')).toBeVisible();
		expect(await problems(page), 'the setup form').toEqual([]);
		// an address nothing is listening on: the failure message shows in the menu
		await request.put('/api/trident', { data: { url: 'http://127.0.0.1:9', key: 'k' } });
		await menu.getByRole('button', { name: 'Cancel' }).click();
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await menu.getByRole('menuitem', { name: /Send to Trident/ }).click();
		await expect(menu.getByRole('alert')).toBeVisible();
		expect(await problems(page), 'the failure message').toEqual([]);
		await menu.getByRole('button', { name: 'Trident settings…' }).click();
		await expect(menu.getByLabel('API key')).toBeVisible();
		expect(await problems(page), 'the settings form').toEqual([]);
		await request.delete('/api/trident');
	});

	test('the designs list when it cannot load, and the editor when the save fails', async ({ page }) => {
		await page.route('**/api/designs', (route) => route.abort());
		await page.goto('/');
		await expect(page.getByRole('alert')).toBeVisible();
		expect(await problems(page)).toEqual([]);
		await page.unroute('**/api/designs');
		await newDesign(page);
		await page.route('**/api/designs/*', (route) => (route.request().method() === 'PUT' ? route.abort() : route.continue()));
		await page.getByLabel('Design name').fill('Renamed');
		await page.getByLabel('Design name').blur();
		await expect(page.getByTestId('save-status')).toHaveText(/Couldn’t save/, { timeout: 15000 });
		expect(await problems(page)).toEqual([]);
	});

	test('the editor with each tool on', async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: /^Box/ }).first().click();
		for (const key of ['r', 'w', 'e', 'n', 'k']) {
			await page.keyboard.press(key);
			expect(await problems(page), key).toEqual([]);
			await page.keyboard.press('Escape');
		}
	});

	test('the editor on a phone', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 780 });
		await newDesign(page);
		expect(await problems(page)).toEqual([]);
	});
});
