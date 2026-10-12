import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, newDesign, pixelAt, selectView, viewport } from './helpers.ts';

/*
 * The Edge tool: choosing edges in the view, previewing a chamfer or round, applying it as one undo step, or cancelling.
 * Results are checked by reading real pixels, as in edgeTreatments.spec.ts.
 */

const toolButton = (page: Page) => page.getByRole('button', { name: 'Edges', exact: true });
const bar = (page: Page) => page.getByTestId('edge-tool');
const row = (page: Page, i: number) => page.getByTestId('object-list').locator('li').nth(i).locator('button').first();
const edgeLines = (page: Page) => page.getByTestId('edge-line');
/** The vertical edge at a 20 mm box's front right corner (x 10, y -10), as drawn by the tool. */
const frontRight = (page: Page) => page.locator('[data-testid="edge-line"][data-from="10,-10,0"][data-to="10,-10,20"]');

/** Clicks the middle of the first drawn piece of an edge, with Shift if asked. */
async function clickEdge(page: Page, edge: ReturnType<typeof frontRight>, shift = false) {
	const line = edge.locator('line').first();
	const at = async (a: string) => Number(await line.getAttribute(a));
	const [x1, y1, x2, y2] = [await at('x1'), await at('y1'), await at('x2'), await at('y2')];
	const box = (await viewport(page).locator('canvas').boundingBox())!;
	if (shift) await page.keyboard.down('Shift');
	await page.mouse.click(box.x + (x1 + x2) / 2, box.y + (y1 + y2) / 2);
	if (shift) await page.keyboard.up('Shift');
}

/** Seen from above at the default zoom (about 2.7 px per mm), 1 mm inside the box's front right corner (x 9, y -9). */
async function blueAtCorner(page: Page) {
	const { x, y } = await center(viewport(page));
	return (await pixelAt(page, x + 24, y + 24))[2];
}

async function fromAbove(page: Page) {
	await selectView(page, 'Top');
	await cameraSettled(page);
}

/** A 20 mm box at the origin, selected, seen from the front right, with the Edge tool on and its edges found. */
async function boxWithTool(page: Page) {
	await newDesign(page);
	await dropShape(page, 'Box');
	await row(page, 0).click();
	await selectView(page, 'Isometric');
	await cameraSettled(page);
	await page.keyboard.press('e');
	await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'true');
	await expect(edgeLines(page)).toHaveCount(12, { timeout: 15_000 });
	await expect(frontRight(page).locator('line')).not.toHaveCount(0); // facing the camera, so drawn
	await expect(page.locator('[data-testid="edge-line"][data-from="-10,10,0"][data-to="10,10,0"] line')).toHaveCount(0); // behind the box
}

test.describe('edge tool', () => {
	test('says what to select when nothing usable is selected, and Escape closes it', async ({ page }) => {
		await newDesign(page);
		await toolButton(page).click();
		await expect(bar(page)).toContainText('Select a shape or group');
		await page.keyboard.press('Escape');
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('click an edge, chamfer it, Apply: the corner is cut, and one Undo puts it back', async ({ page }) => {
		await boxWithTool(page);
		await clickEdge(page, frontRight(page));
		await expect(bar(page)).toContainText('1 edge chosen');
		await expect(frontRight(page)).toHaveClass('chosen');
		await bar(page).getByLabel('Size', { exact: true }).fill('6');
		await bar(page).getByRole('button', { name: 'Apply' }).click();
		await expect(frontRight(page)).toHaveClass('treated'); // shown as already treated

		await fromAbove(page);
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeGreaterThan(150); // the pale workplane shows through

		await page.keyboard.press('Control+z');
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeLessThan(150);
	});

	test('Cancel leaves the design as it was, with nothing to undo', async ({ page }) => {
		await boxWithTool(page);
		await clickEdge(page, frontRight(page));
		await bar(page).getByLabel('Round').check();
		await bar(page).getByLabel('Size', { exact: true }).fill('6');
		await fromAbove(page);
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeGreaterThan(150); // previewed live

		await bar(page).getByRole('button', { name: 'Cancel' }).click();
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeLessThan(150);
		await expect(page.locator('[data-testid="edge-line"].treated')).toHaveCount(0);
		await page.keyboard.press('Control+z'); // the only step to undo is adding the box
		await expect(page.getByText('Objects: 0')).toBeVisible();
	});

	test('closing the tool mid-preview drops the preview, with nothing to undo', async ({ page }) => {
		await boxWithTool(page);
		await clickEdge(page, frontRight(page));
		await bar(page).getByLabel('Size', { exact: true }).fill('6');
		await fromAbove(page);
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeGreaterThan(150); // previewed
		await toolButton(page).click(); // close the tool (the Size box has focus, so E would type into it)
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('Escape'); // deselect: the box's resize handles are back and one sits on the corner
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeLessThan(150);
		await page.keyboard.press('Control+z'); // nothing was recorded: the only step is adding the box
		await expect(page.getByText('Objects: 0')).toBeVisible();
	});

	test('Escape drops the chosen edges and their preview but keeps the part selected; a second Escape closes the tool', async ({ page }) => {
		await boxWithTool(page);
		await clickEdge(page, frontRight(page));
		await bar(page).getByLabel('Size', { exact: true }).fill('6');
		await fromAbove(page);
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeGreaterThan(150); // previewed
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // as after choosing with the mouse: not typing
		await page.keyboard.press('Escape');
		await expect(bar(page)).toContainText('Click an edge to choose it');
		await expect(page.getByText('Selected: 1')).toBeVisible();
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeLessThan(150);
		await page.keyboard.press('Escape');
		await expect(toolButton(page)).toHaveAttribute('aria-pressed', 'false');
		await expect(page.getByText('Selected: 1')).toBeVisible();
	});

	test('Shift adds edges, All outer edges takes every one, and a treated edge can be removed again', async ({ page }) => {
		await boxWithTool(page);
		await clickEdge(page, frontRight(page));
		const top = page.locator('[data-testid="edge-line"][data-from="10,-10,20"], [data-testid="edge-line"][data-to="10,-10,20"]');
		await clickEdge(page, top.filter({ hasNot: page.locator('[data-from="10,-10,0"]') }).first(), true);
		await expect(bar(page)).toContainText('2 edges chosen');
		await bar(page).getByRole('button', { name: 'All outer edges' }).click();
		await expect(bar(page)).toContainText('12 edges chosen');
		await bar(page).getByRole('button', { name: 'Clear' }).click();

		await clickEdge(page, frontRight(page));
		await bar(page).getByLabel('Size', { exact: true }).fill('6');
		await bar(page).getByRole('button', { name: 'Apply' }).click();
		await expect(frontRight(page)).toHaveClass('treated');

		await clickEdge(page, frontRight(page));
		await bar(page).getByRole('button', { name: 'Remove' }).click();
		await expect(page.locator('[data-testid="edge-line"].treated')).toHaveCount(0);
		await fromAbove(page);
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeLessThan(150);
	});
});
