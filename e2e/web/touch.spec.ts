import { expect, test } from '@playwright/test';
import { Fingers } from './fingers.ts';
import { camera, center, newDesign, objects, openPanel, selectedNames, viewport } from './helpers.ts';

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('touch camera controls', () => {
	test('one finger dragging empty space orbits the camera', async ({ page }) => {
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		const before = await camera(page);
		await fingers.drag([{ x: c.x + 150, y: c.y + 150 }], [{ x: c.x + 250, y: c.y + 100 }]);
		await expect.poll(async () => (await camera(page)).azimuth).not.toBe(before.azimuth);
		const after = await camera(page);
		expect(after.polar).not.toBe(before.polar);
		expect(after.distance).toBeCloseTo(before.distance, 3);
		expect(after.target).toEqual(before.target);
	});

	test('a one-finger drag on empty space does not draw a selection box', async ({ page }) => {
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		await fingers.drag([{ x: c.x + 150, y: c.y + 150 }], [{ x: c.x + 250, y: c.y + 100 }]);
		await expect(page.getByTestId('marquee')).toHaveCount(0);
	});

	test('two fingers sliding together pan the view', async ({ page }) => {
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		const before = await camera(page);
		await fingers.drag(
			[
				{ x: c.x - 40, y: c.y + 150 },
				{ x: c.x + 40, y: c.y + 150 },
			],
			[
				{ x: c.x + 60, y: c.y + 150 },
				{ x: c.x + 140, y: c.y + 150 },
			],
		);
		await expect.poll(async () => (await camera(page)).target).not.toEqual(before.target);
		const after = await camera(page);
		expect(after.azimuth).toBeCloseTo(before.azimuth, 5);
		expect(after.distance).toBeCloseTo(before.distance, 3);
	});

	test('pinching two fingers apart zooms in, together zooms out', async ({ page }) => {
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		const start = (await camera(page)).distance;

		await fingers.drag(
			[
				{ x: c.x - 40, y: c.y + 150 },
				{ x: c.x + 40, y: c.y + 150 },
			],
			[
				{ x: c.x - 120, y: c.y + 150 },
				{ x: c.x + 120, y: c.y + 150 },
			],
		);
		await expect.poll(async () => (await camera(page)).distance).toBeLessThan(start * 0.8);
		const zoomedIn = (await camera(page)).distance;

		await fingers.drag(
			[
				{ x: c.x - 120, y: c.y + 150 },
				{ x: c.x + 120, y: c.y + 150 },
			],
			[
				{ x: c.x - 40, y: c.y + 150 },
				{ x: c.x + 40, y: c.y + 150 },
			],
		);
		await expect.poll(async () => (await camera(page)).distance).toBeGreaterThan(zoomedIn * 1.5);
	});

	test('a finger on a shape still moves the shape, not the camera', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		const before = await camera(page);
		await fingers.drag([{ x: c.x, y: c.y }], [{ x: c.x + 80, y: c.y }]);
		await expect.poll(async () => (await objects(page))[0]?.x).toBeGreaterThan(5);
		expect((await camera(page)).azimuth).toBe(before.azimuth);
	});

	test('tapping empty space still clears the selection', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
		await openPanel(page, 'Objects');
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		await expect.poll(() => selectedNames(page)).toEqual(['Box 1']);
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		await fingers.tap({ x: c.x + 250, y: c.y + 180 });
		await expect.poll(() => selectedNames(page)).toEqual([]);
	});
});
