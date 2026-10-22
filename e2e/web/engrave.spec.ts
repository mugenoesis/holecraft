import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, newDesign, selectView, viewport } from './helpers.ts';
import { parseStl, stlCorners } from './meshFiles.ts';

/*
 * The Engrave tool: click a face, the view looks straight at it, the words are typed and sized, and Done fits them to the surface beneath and
 * engraves them (a hole grouped with the shape) or raises them. Proved from real STL exports: the volume the lettering takes out or adds, and how
 * deep the cut goes.
 */

const tool = (page: Page) => page.getByRole('button', { name: 'Engrave', exact: true }).first();
const bar = (page: Page) => page.getByTestId('engrave-bar');
const hint = (page: Page) => page.getByTestId('engrave-hint');
const list = (page: Page) => page.getByTestId('object-list');

async function exportStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	const file = await readFile(await download.path());
	return { info: parseStl(file), corners: stlCorners(file) };
}

async function clickAt(page: Page, dx: number, dy = 0) {
	const { x, y } = await center(viewport(page));
	await page.mouse.click(x + dx, y + dy);
}

/** A 20 mm box (8000 mm3) at the origin seen from above, so the middle of the view is its top. */
async function boxFromAbove(page: Page, shape: 'Box' | 'Sphere' = 'Box') {
	await dropShape(page, shape);
	await selectView(page, 'Top');
	await cameraSettled(page);
}

async function fill(page: Page, label: string, value: string) {
	await bar(page).getByLabel(label, { exact: true }).fill(value);
}

/** Starts the tool on the middle of the view and sets the words, the size and the depth. */
async function startOnTop(page: Page, words: string, size: string, depth: string) {
	await tool(page).click();
	await clickAt(page, 0);
	await expect(bar(page)).toBeVisible();
	await fill(page, 'Words', words);
	await fill(page, 'Letter size', size);
	await fill(page, 'Depth', depth);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('the Engrave tool', () => {
	test('the button and the T key turn it on and off, Escape cancels, and it says what to click', async ({ page }) => {
		await expect(tool(page)).toHaveAttribute('aria-pressed', 'false');
		await tool(page).click();
		await expect(tool(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(hint(page)).toContainText('Click a face of a shape');
		await page.keyboard.press('t');
		await expect(tool(page)).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('t');
		await page.keyboard.press('Escape');
		await expect(tool(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('a click on the bare floor says to click a shape', async ({ page }) => {
		await boxFromAbove(page);
		await tool(page).click();
		await clickAt(page, 150);
		await expect(hint(page)).toContainText('Click a face of a shape');
		await expect(bar(page)).toBeHidden();
	});

	test('engraves the words into the top of a box: the box loses volume, cut as deep as asked, and Undo gives the box back', async ({
		page,
	}) => {
		await boxFromAbove(page);
		await startOnTop(page, 'I', '10', '2');
		await bar(page).getByRole('button', { name: 'Done' }).click();
		await expect(bar(page)).toBeHidden({ timeout: 20_000 });
		await expect(tool(page)).toHaveAttribute('aria-pressed', 'false');
		await expect(list(page).locator('li')).toHaveCount(1); // the box and its engraving, grouped

		const { info, corners } = await exportStl(page);
		expect(8000 - info.volume).toBeGreaterThan(5);
		expect(8000 - info.volume).toBeLessThan(120);
		expect(Math.round(info.max[2]! * 1000) / 1000).toBe(20);
		expect([...corners].some((c) => c.endsWith(',18.000'))).toBe(true); // the floor of the cut: 2 mm below the top

		await page.keyboard.press('Control+z');
		await expect(list(page).locator('li')).toHaveCount(1);
		expect((await exportStl(page)).info.volume).toBeCloseTo(8000, 0);
	});

	test('raised lettering stands the height out of the surface and adds volume', async ({ page }) => {
		await boxFromAbove(page);
		await startOnTop(page, 'I', '10', '1.5');
		await bar(page).getByRole('button', { name: 'Raised' }).click();
		await expect(bar(page).getByLabel('Height', { exact: true })).toBeVisible();
		await bar(page).getByRole('button', { name: 'Done' }).click();
		await expect(bar(page)).toBeHidden({ timeout: 20_000 });
		const { info } = await exportStl(page);
		expect(info.volume - 8000).toBeGreaterThan(3);
		expect(info.volume - 8000).toBeLessThan(80);
		expect(info.max[2]!).toBeCloseTo(21.5, 2);
	});

	test('follows a curved surface: lettering on a sphere is cut into it', async ({ page }) => {
		await boxFromAbove(page, 'Sphere');
		await startOnTop(page, 'I', '6', '1');
		await bar(page).getByRole('button', { name: 'Done' }).click();
		await expect(bar(page)).toBeHidden({ timeout: 20_000 });
		const sphere = (4 / 3) * Math.PI * 10 ** 3;
		const { info } = await exportStl(page);
		expect(sphere - info.volume).toBeGreaterThan(1);
		expect(sphere - info.volume).toBeLessThan(60);
	});

	test('lettering that hangs over the edge is refused with the reason, the tool stays open, and smaller letters work', async ({ page }) => {
		await boxFromAbove(page);
		await startOnTop(page, 'WIDE WORDS', '40', '1');
		await bar(page).getByRole('button', { name: 'Done' }).click();
		await expect(bar(page)).toContainText('past the edge');
		await expect(bar(page)).toBeVisible();
		await fill(page, 'Letter size', '3');
		await bar(page).getByRole('button', { name: 'Done' }).click();
		await expect(bar(page)).toBeHidden({ timeout: 20_000 });
		const { info } = await exportStl(page);
		expect(8000 - info.volume).toBeGreaterThan(1);
	});

	test('says what is wrong with the depth without leaving the tool', async ({ page }) => {
		await boxFromAbove(page);
		await startOnTop(page, 'I', '10', '0');
		await bar(page).getByRole('button', { name: 'Done' }).click();
		await expect(bar(page)).toContainText('depth');
		await expect(bar(page)).toBeVisible();
	});

	test('the bar passes the accessibility scan', async ({ page }) => {
		await boxFromAbove(page);
		await tool(page).click();
		await clickAt(page, 0);
		await expect(bar(page)).toBeVisible();
		const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
		expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
	});
});
