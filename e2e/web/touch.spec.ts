import { type CDPSession, expect, type Page, test } from '@playwright/test';
import { camera, center, newDesign, objects, selectedNames, viewport } from './helpers.ts';

/** Real touch input through Chrome's DevTools protocol, so the page sees genuine touch pointer events. */
class Fingers {
	private constructor(private readonly cdp: CDPSession) {}

	static async on(page: Page) {
		return new Fingers(await page.context().newCDPSession(page));
	}

	private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) {
		await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })) });
	}

	/** Puts fingers down, moves them in steps, and lifts them. `from` and `to` list one point per finger. */
	async drag(from: { x: number; y: number }[], to: { x: number; y: number }[], steps = 8) {
		const at = (t: number) => from.map((f, i) => ({ x: f.x + (to[i]!.x - f.x) * t, y: f.y + (to[i]!.y - f.y) * t, id: i }));
		await this.send('touchStart', at(0));
		for (let s = 1; s <= steps; s++) await this.send('touchMove', at(s / steps));
		await this.send('touchEnd', []);
	}

	async tap(point: { x: number; y: number }) {
		await this.send('touchStart', [{ ...point, id: 0 }]);
		await this.send('touchEnd', []);
	}
}

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
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		const before = await camera(page);
		await fingers.drag([{ x: c.x, y: c.y }], [{ x: c.x + 80, y: c.y }]);
		await expect.poll(async () => (await objects(page))[0]?.x).toBeGreaterThan(5);
		expect((await camera(page)).azimuth).toBe(before.azimuth);
	});

	test('tapping empty space still clears the selection', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		await expect.poll(() => selectedNames(page)).toEqual(['Box 1']);
		const fingers = await Fingers.on(page);
		const c = await center(viewport(page));
		await fingers.tap({ x: c.x + 250, y: c.y + 180 });
		await expect.poll(() => selectedNames(page)).toEqual([]);
	});
});
