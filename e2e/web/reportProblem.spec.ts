import { expect, test } from '@playwright/test';
import { newDesign } from './helpers.ts';

const OPEN = 'https://github.com/mugenoesis/holecraft/issues/new';

test.describe('reporting a problem', () => {
	test('the shortcut sheet links to a new issue with the version and browser filled in', async ({ page }) => {
		await newDesign(page);
		await page.keyboard.press('?');
		const link = page.getByRole('dialog').getByRole('link', { name: 'Report a problem' });
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', /noopener/);
		// the server's version arrives a moment after the sheet opens
		await expect
			.poll(async () => {
				const href = (await link.getAttribute('href')) ?? '';
				return new URL(href, 'http://x').searchParams.get('body') ?? '';
			})
			.toMatch(/Holecraft \S+\n- Browser: .*Chrome/s);
		const href = (await link.getAttribute('href')) ?? '';
		expect(href.startsWith(`${OPEN}?`)).toBe(true);
	});

	test('the designs list has the same link', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', new RegExp(`^${OPEN}\\?`));
	});

	test('Copy diagnostics gives the system and the errors the page hit, and no design data', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await newDesign(page);
		await page.getByLabel('Design name').fill('Secret project name');
		await page.getByLabel('Design name').blur();
		await page.evaluate(() => setTimeout(() => Promise.reject(new Error('a made-up failure')), 0));
		await page.keyboard.press('?');
		await page.getByRole('button', { name: 'Copy diagnostics' }).click();
		await expect(page.getByText('Copied')).toBeVisible();
		const text = await page.evaluate(() => navigator.clipboard.readText());
		expect(text).toMatch(/Holecraft \S+/);
		expect(text).toContain('Chrome');
		expect(text).toContain('a made-up failure');
		expect(text).not.toContain('Secret project name');
	});

	test('with no clipboard to use, the text is shown to copy by hand', async ({ page }) => {
		await newDesign(page);
		await page.evaluate(() => {
			Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
		});
		await page.keyboard.press('?');
		await page.getByRole('button', { name: 'Copy diagnostics' }).click();
		await expect(page.getByLabel('Diagnostics to copy')).toHaveValue(/Recent errors:/);
	});
});
