import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { camera, cameraSettled, center, newDesign, selectView, viewport } from './helpers.ts';

/*
 * The size of the workplane (the build plate): Width and Depth in the side panel, from 10 mm up to 100 cm. The plate is drawn at the new size in
 * the open view, the camera backs off to suit it, and the size is saved with the design.
 */

const section = (page: Page) => page.getByRole('region', { name: 'Workplane' });
const width = (page: Page) => section(page).getByLabel('Width', { exact: true });
const depth = (page: Page) => section(page).getByLabel('Depth', { exact: true });
const statusBar = (page: Page) => page.locator('footer.statusbar');

async function setSize(page: Page, w: string, d: string) {
	await width(page).fill(w);
	await width(page).press('Enter');
	await depth(page).fill(d);
	await depth(page).press('Enter');
	await page.getByRole('heading', { name: 'Objects' }).click(); // so keys go to the editor again
}

/** The brightest red in a small square on the screen: the plate is nearly white, and the background and everything round it is darker. */
async function brightestRed(page: Page, x: number, y: number, half = 4): Promise<number> {
	const png = await page.screenshot({ clip: { x: Math.floor(x - half), y: Math.floor(y - half), width: half * 2, height: half * 2 } });
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(image, 0, 0);
		const data = ctx.getImageData(0, 0, image.width, image.height).data;
		let best = 0;
		for (let i = 0; i < data.length; i += 4) best = Math.max(best, data[i]!);
		return best;
	}, png.toString('base64'));
}

/** Zooms out with the wheel until the camera is at least this far away, so that a big plate is all in view. */
async function zoomOutTo(page: Page, distance: number) {
	const c = await center(viewport(page));
	await page.mouse.move(c.x, c.y);
	for (let i = 0; i < 40 && (await camera(page)).distance < distance; i++) {
		await page.mouse.wheel(0, 500);
		await cameraSettled(page);
	}
	expect((await camera(page)).distance).toBeGreaterThanOrEqual(distance);
}

/** Whether the plate reaches this far to the right of the middle of the view, looking straight down from far enough to see 450 mm either way. */
async function plateReaches(page: Page, mmRight: number): Promise<boolean> {
	await selectView(page, 'Top');
	await zoomOutTo(page, 1500);
	const { distance } = await camera(page);
	const box = (await viewport(page).boundingBox())!;
	const pixelsPerMm = box.height / 2 / (distance * Math.tan((20 * Math.PI) / 180));
	const c = await center(viewport(page));
	return (await brightestRed(page, c.x + mmRight * pixelsPerMm, c.y)) >= 240;
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('the size of the workplane', () => {
	test('starts at 200 × 200 mm, in a Workplane section of the side panel', async ({ page }) => {
		await expect(section(page)).toBeVisible();
		await expect(width(page)).toHaveValue('200');
		await expect(depth(page)).toHaveValue('200');
		await expect(statusBar(page)).toContainText('Workplane 200 × 200');
		await expect(section(page)).toContainText('1000 mm (100 cm)');
	});

	test('can be made bigger or smaller, and the status bar and the view say so', async ({ page }) => {
		await setSize(page, '400', '300');
		await expect(statusBar(page)).toContainText('Workplane 400 × 300');
		await expect(viewport(page)).toHaveAttribute('data-workplane', '400x300');
		await setSize(page, '50', '75');
		await expect(statusBar(page)).toContainText('Workplane 50 × 75');
	});

	test('is kept between 10 mm and 1000 mm (100 cm): a number outside is brought back', async ({ page }) => {
		await setSize(page, '5000', '1');
		await expect(width(page)).toHaveValue('1000');
		await expect(depth(page)).toHaveValue('10');
		await expect(statusBar(page)).toContainText('Workplane 1000 × 10');
	});

	test('is saved with the design', async ({ page }) => {
		await setSize(page, '640', '480');
		const id = page.url().split('/').pop();
		await expect
			.poll(async () => JSON.stringify(((await (await page.request.get(`/api/designs/${id}`)).json()) as { grid: unknown }).grid))
			.toContain('640');
		await page.reload();
		await expect(width(page)).toHaveValue('640');
		await expect(depth(page)).toHaveValue('480');
		await expect(viewport(page)).toHaveAttribute('data-workplane', '640x480');
	});

	test('is one undo step for each of Width and Depth', async ({ page }) => {
		await setSize(page, '500', '400');
		await page.keyboard.press('Control+z');
		await expect(depth(page)).toHaveValue('200');
		await expect(width(page)).toHaveValue('500');
		await page.keyboard.press('Control+z');
		await expect(width(page)).toHaveValue('200');
		await expect(statusBar(page)).toContainText('Workplane 200 × 200');
	});

	test('draws the plate at the new size in the open view, so it reaches 450 mm from the middle only once it is 1000 mm wide', async ({
		page,
	}) => {
		expect(await plateReaches(page, 450)).toBe(false);
		await setSize(page, '1000', '1000');
		expect(await plateReaches(page, 450)).toBe(true);
		expect(await plateReaches(page, 560)).toBe(false);
	});

	test('backs the camera away for a big plate when it has not been moved, so all of it is in view', async ({ page }) => {
		await cameraSettled(page);
		const before = (await camera(page)).distance;
		await setSize(page, '1000', '1000');
		await expect.poll(async () => (await camera(page)).distance).toBeGreaterThan(before * 4);
		await setSize(page, '100', '100');
		await expect.poll(async () => (await camera(page)).distance).toBeLessThan(before);
	});

	test('keeps the camera where the user put it', async ({ page }) => {
		await selectView(page, 'Front');
		await cameraSettled(page);
		const before = await camera(page);
		await setSize(page, '800', '800');
		const after = await camera(page);
		expect(after.distance).toBeCloseTo(before.distance, 3);
		expect(after.azimuth).toBeCloseTo(before.azimuth, 3);
	});

	test('passes the accessibility scan', async ({ page }) => {
		await expect(section(page)).toBeVisible();
		expect(
			(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('[aria-label="Workplane"]').analyze()).violations,
		).toEqual([]);
	});
});
