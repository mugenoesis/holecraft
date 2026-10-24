import { expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, dropShape, newDesign, selectView, viewport } from './helpers.ts';

const zeroButton = (page: Page) => page.getByRole('button', { name: 'Zero point', exact: true });

/** Top view, so pixels map to millimetres (about 2.7 px per mm at the default zoom). */
async function topView(page: Page) {
	await selectView(page, 'Top');
	await cameraSettled(page);
}

async function clickAt(page: Page, dx: number, dy = 0) {
	const { x, y } = await center(viewport(page));
	await page.mouse.click(x + dx, y + dy);
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('zero point', () => {
	test('the button and the O key turn the tool on and off', async ({ page }) => {
		await expect(zeroButton(page)).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.press('o');
		await expect(zeroButton(page)).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByTestId('zero-readout')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(zeroButton(page)).toHaveAttribute('aria-pressed', 'false');
	});

	test('a click drops the ring, the tool lets go and a selected shape shows its x and y distance', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await clickAt(page, 0); // selects the box
		await zeroButton(page).click();
		await clickAt(page, -150, 100);
		await expect(zeroButton(page)).toHaveAttribute('aria-pressed', 'false');
		await expect(page.getByTestId('zero-ring')).toBeVisible();
		// the box (selected after the drop) is about 55 mm right of and 37 mm above the point: 150 px and 100 px less its half size
		const x = page.getByTestId('zero-strip-x');
		const y = page.getByTestId('zero-strip-y');
		await expect(x).toBeAttached();
		await expect(y).toBeAttached();
		expect(Math.abs(Number(await x.getAttribute('data-length')))).toBeGreaterThan(30);
		expect(Math.abs(Number(await y.getAttribute('data-length')))).toBeGreaterThan(15);
		await expect(page.getByTestId('zero-input-x')).toBeVisible();
	});

	test('typing a distance in a reading moves the selection there, and undo puts it back', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await clickAt(page, 0);
		await zeroButton(page).click();
		await clickAt(page, -150, 100);
		const x = page.getByTestId('zero-strip-x');
		const input = page.getByTestId('zero-input-x');
		const before = Number(await x.getAttribute('data-reading'));
		await input.fill('20');
		await input.press('Enter');
		await expect(x).toHaveAttribute('data-reading', '20');
		await expect(input).toHaveValue('20');
		await page.keyboard.press('Escape');
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Control+z');
		await expect(x).toHaveAttribute('data-reading', String(before));
	});

	test('Clear zero point removes the ring and the strips', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await clickAt(page, 0); // selects the box
		await page.keyboard.press('o');
		await clickAt(page, -150, 100);
		await page.keyboard.press('o');
		await page.getByRole('button', { name: 'Clear zero point' }).click();
		await expect(page.getByTestId('zero-ring')).toHaveCount(0);
		await expect(page.getByTestId('zero-strip-x')).toHaveCount(0);
	});

	test('clicking the corner of the L turns it a quarter and the readings follow its arms', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await clickAt(page, 0); // selects the box
		await page.keyboard.press('o');
		await clickAt(page, -150, 100);
		const lines = page.getByTestId('zero-point');
		await expect(lines).toHaveAttribute('data-turns', '0');
		const before = Number(await page.getByTestId('zero-strip-x').getAttribute('data-reading'));
		expect(before).toBeGreaterThan(0);
		await page.getByTestId('zero-ring').click();
		await expect(lines).toHaveAttribute('data-turns', '1');
		// the x arm now points against the world's x, so the box, which lies along +x, reads negative
		await expect(page.getByTestId('zero-strip-x')).toHaveAttribute('data-reading', String(-before));
		for (let i = 0; i < 3; i++) await page.getByTestId('zero-ring').click();
		await expect(lines).toHaveAttribute('data-turns', '0');
	});

	test('the lift handle still reads Z while the zero point is set', async ({ page }) => {
		await dropShape(page, 'Box');
		await topView(page);
		await clickAt(page, 0); // selects the box
		await page.keyboard.press('o');
		await clickAt(page, -150, 100);
		await expect(page.getByTestId('handle-lift')).toBeVisible();
	});
});
