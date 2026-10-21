import { expect, type Page, test } from '@playwright/test';
import { newDesign } from './helpers.ts';

/*
 * The desktop side panel can be made wider or narrower (drag its edge, or use the arrow keys on it), and each of its sections can be
 * folded away. Both are remembered in the browser. The panel is measured where it really is.
 */

const panel = (page: Page) => page.locator('aside.panel');
const edge = (page: Page) => page.getByRole('separator', { name: 'Resize the side panel' });
const width = async (page: Page) => Math.round((await panel(page).boundingBox())!.width);

test.describe('the side panel width', () => {
	test.beforeEach(async ({ page }) => {
		await newDesign(page);
	});

	test('starts at its usual width and is dragged wider and narrower by its edge', async ({ page }) => {
		expect(await width(page)).toBe(260);
		const box = (await edge(page).boundingBox())!;
		const y = box.y + box.height / 2;
		const x = box.x + box.width / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x - 100, y, { steps: 5 });
		await page.mouse.up();
		await expect.poll(() => width(page)).toBeGreaterThan(340);
		await expect.poll(() => width(page)).toBeLessThan(380);
		// it is limited at both ends
		await page.mouse.move(x - 100, y);
		await page.mouse.down();
		await page.mouse.move(5, y, { steps: 5 });
		await page.mouse.up();
		await expect.poll(() => width(page)).toBe(560);
	});

	test('is moved a step at a time with the arrow keys, and Home puts it back', async ({ page }) => {
		await edge(page).focus();
		await page.keyboard.press('ArrowLeft');
		await expect.poll(() => width(page)).toBe(276);
		await page.keyboard.press('Shift+ArrowLeft');
		await expect.poll(() => width(page)).toBe(340);
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => width(page)).toBe(324);
		await expect(edge(page)).toHaveAttribute('aria-valuenow', '324');
		await page.keyboard.press('Home');
		await expect.poll(() => width(page)).toBe(260);
	});

	test('is put back to its usual width by a double click, and kept when the page is opened again', async ({ page }) => {
		await edge(page).focus();
		await page.keyboard.press('Shift+ArrowLeft');
		await expect.poll(() => width(page)).toBe(324);
		await page.reload();
		await expect.poll(() => width(page)).toBe(324);
		await edge(page).dblclick();
		await expect.poll(() => width(page)).toBe(260);
		await page.reload();
		await expect.poll(() => width(page)).toBe(260);
	});

	test('the 3D view takes the room the panel gives up', async ({ page }) => {
		const before = (await page.getByTestId('viewport').boundingBox())!.width;
		await edge(page).focus();
		await page.keyboard.press('Shift+ArrowLeft');
		await expect.poll(async () => (await page.getByTestId('viewport').boundingBox())!.width).toBeLessThan(before - 60);
	});
});

test.describe('folding the sections of the side panel', () => {
	test.beforeEach(async ({ page }) => {
		await newDesign(page);
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
	});

	const resin = (page: Page) => page.getByRole('region', { name: 'Resin' });
	const fold = (page: Page, name: string) => page.getByRole('button', { name: `Collapse ${name}` });
	const open = (page: Page, name: string) => page.getByRole('button', { name: `Expand ${name}` });

	test('a section folds to its heading and opens again, and says which it is', async ({ page }) => {
		await expect(page.getByRole('button', { name: /Hollow the selected shape/ })).toBeVisible();
		await expect(fold(page, 'Resin')).toHaveAttribute('aria-expanded', 'true');
		await fold(page, 'Resin').click();
		await expect(page.getByRole('button', { name: /Hollow the selected shape/ })).toBeHidden();
		await expect(resin(page).getByRole('heading', { name: 'Resin' })).toBeVisible();
		await expect(open(page, 'Resin')).toHaveAttribute('aria-expanded', 'false');
		await open(page, 'Resin').click();
		await expect(page.getByRole('button', { name: /Hollow the selected shape/ })).toBeVisible();
	});

	test('every section of the panel can be folded, and each on its own', async ({ page }) => {
		for (const name of ['Shapes', 'Properties', 'Resin', 'Arrange', 'Colours', 'Objects']) await expect(fold(page, name)).toBeVisible();
		await fold(page, 'Objects').click();
		await expect(open(page, 'Objects')).toBeVisible();
		await expect(fold(page, 'Colours')).toBeVisible();
		await expect(page.getByTestId('object-list')).toBeHidden();
	});

	test('what was typed in a folded section is still there when it is opened', async ({ page }) => {
		const search = page.getByRole('searchbox').first();
		await search.fill('cyl');
		await fold(page, 'Shapes').click();
		await open(page, 'Shapes').click();
		await expect(search).toHaveValue('cyl');
	});

	test('the folded sections are kept when the page is opened again', async ({ page }) => {
		await fold(page, 'Resin').click();
		await fold(page, 'Arrange').click();
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await expect(open(page, 'Resin')).toBeVisible();
		await expect(open(page, 'Arrange')).toBeVisible();
		await expect(fold(page, 'Colours')).toBeVisible();
	});

	test('clicking a heading does not fold anything (only its arrow does)', async ({ page }) => {
		await resin(page).getByRole('heading', { name: 'Resin' }).click();
		await expect(fold(page, 'Resin')).toHaveAttribute('aria-expanded', 'true');
	});
});

test.describe('on a phone the panel keeps its tabs', () => {
	test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

	test('there is no edge to drag and no arrow on the headings', async ({ page }) => {
		await newDesign(page);
		await expect(edge(page)).toHaveCount(0);
		await expect(page.getByRole('button', { name: /^(Collapse|Expand) / })).toHaveCount(0);
	});
});
