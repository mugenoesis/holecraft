import { expect, type Page, test } from '@playwright/test';
import { camera, cameraSettled, newDesign } from './helpers.ts';

/*
 * The editor on 4:3 screens (old monitors, iPads, a browser window tiled to a square-ish shape). These
 * measure real positions, like phone.spec.ts, so the layout can't quietly break again.
 */

for (const size of [
	{ width: 1024, height: 768 },
	{ width: 800, height: 600 },
]) {
	test.describe(`on a ${size.width} x ${size.height} screen`, () => {
		test.use({ viewport: size });

		test.beforeEach(async ({ page }) => {
			await newDesign(page);
		});

		test('nothing in the top bar runs off the screen, and the page does not scroll sideways', async ({ page }) => {
			const buttons = page.locator('.topbar button:visible, .topbar a:visible, .topbar input:visible');
			for (let i = 0; i < (await buttons.count()); i++) {
				const b = (await buttons.nth(i).boundingBox())!;
				expect(b.x, `top bar item ${i} starts on screen`).toBeGreaterThanOrEqual(0);
				expect(b.x + b.width, `top bar item ${i} ends on screen`).toBeLessThanOrEqual(size.width);
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
		});

		test('the camera opens far enough back to show the whole workplane, and Home does the same', async ({ page }) => {
			await cameraSettled(page);
			const opened = (await camera(page)).distance;
			expect(opened).toBeGreaterThan(330);
			await page.getByRole('button', { name: 'Box', exact: true }).click();
			await page.getByRole('button', { name: 'Fit all' }).click();
			await page.getByRole('button', { name: 'Home view' }).click();
			await expect.poll(async () => (await camera(page)).distance).toBeCloseTo(opened, 0);
		});

		test('the panel is no taller than it needs to be: Properties is reachable', async ({ page }) => {
			await page.getByRole('button', { name: 'Box', exact: true }).click();
			await expectVisibleWithoutScrolling(page);
		});
	});
}

/** The shapes panel plus the first Properties field must fit on one 4:3 screen once something is selected. */
async function expectVisibleWithoutScrolling(page: Page) {
	await page.keyboard.press('Control+a');
	const name = page.getByRole('region', { name: 'Properties' }).getByLabel('Name', { exact: true });
	const box = (await name.boundingBox())!;
	expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}
