import { expect, type Locator, type Page, test } from '@playwright/test';
import { camera, center, drag, dropShape, field, newDesign, objects, properties, selectedNames, viewport } from './helpers.ts';

const handle = (page: Page, id: string) => page.getByTestId(`handle-${id}`);
const ALL_HANDLES = ['corner-pp', 'corner-np', 'corner-pn', 'corner-nn', 'side-px', 'side-nx', 'side-py', 'side-ny', 'height', 'lift'];

const centerOf = async (locator: Locator) => {
	const { x, y } = await center(locator);
	return { x, y };
};

const num = async (page: Page, name: string) => Number(await field(page, name).inputValue());
const readDims = async (page: Page) => ({ w: await num(page, 'Width'), d: await num(page, 'Depth'), h: await num(page, 'Height') });

/** The size fields once they stop changing, so a read straight after a drag can't catch a stale render. */
async function dims(page: Page) {
	let prev = await readDims(page);
	for (let i = 0; i < 25; i++) {
		await page.waitForTimeout(40);
		const next = await readDims(page);
		if (next.w === prev.w && next.d === prev.d && next.h === prev.h) return next;
		prev = next;
	}
	return prev;
}

/** Drag a handle `px` screen pixels directly away from the middle of the view. */
async function dragAway(page: Page, id: string, px: number, opts: { shift?: boolean; alt?: boolean } = {}) {
	const from = await centerOf(handle(page, id));
	const mid = await centerOf(viewport(page));
	const dx = from.x - mid.x;
	const dy = from.y - mid.y;
	const len = Math.hypot(dx, dy) || 1;
	const to = { x: from.x + (dx / len) * px, y: from.y + (dy / len) * px };
	if (opts.alt) await page.keyboard.down('Alt');
	await drag(page, from, to, { shift: opts.shift });
	if (opts.alt) await page.keyboard.up('Alt');
}

async function dragBy(page: Page, id: string, dx: number, dy: number) {
	const from = await centerOf(handle(page, id));
	await drag(page, from, { x: from.x + dx, y: from.y + dy });
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
	await dropShape(page, 'Box');
	const mid = await centerOf(viewport(page));
	await page.mouse.click(mid.x, mid.y);
	await expect(field(page, 'Width')).toHaveValue('20');
});

test.describe('handle visibility', () => {
	test('a single selected shape shows every handle', async ({ page }) => {
		for (const id of ALL_HANDLES) await expect(handle(page, id)).toBeVisible();
	});

	test('no handles with nothing selected', async ({ page }) => {
		await page.keyboard.press('Escape');
		await expect(page.getByTestId(/^handle-/)).toHaveCount(0);
	});

	test('no handles with several shapes selected', async ({ page }) => {
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await expect(page.getByTestId(/^handle-/)).toHaveCount(0);
	});

	test('handles follow the shape when it moves', async ({ page }) => {
		const before = await centerOf(handle(page, 'corner-pp'));
		await page.keyboard.press('Shift+ArrowRight');
		await expect.poll(async () => (await centerOf(handle(page, 'corner-pp'))).x).not.toBeCloseTo(before.x, 0);
	});

	test('handles are exposed to assistive technology', async ({ page }) => {
		await expect(handle(page, 'corner-pp')).toHaveAttribute('aria-label', /resize/i);
		await expect(handle(page, 'lift')).toHaveAttribute('aria-label', /lift/i);
	});
});

test.describe('resizing', () => {
	test('dragging a corner grows width and depth and keeps the opposite corner fixed', async ({ page }) => {
		const farBefore = await centerOf(handle(page, 'corner-nn'));
		await dragAway(page, 'corner-pp', 70);
		const { w, d, h } = await dims(page);
		expect(w).toBeGreaterThan(20);
		expect(d).toBeGreaterThan(20);
		expect(h).toBe(20);
		const farAfter = await centerOf(handle(page, 'corner-nn'));
		expect(farAfter.x).toBeCloseTo(farBefore.x, 0);
		expect(farAfter.y).toBeCloseTo(farBefore.y, 0);
		await expect.poll(() => num(page, 'X')).toBeGreaterThan(0); // the centre moved with the growing edge
	});

	test('dragging a side changes only that dimension', async ({ page }) => {
		await dragAway(page, 'side-px', 60);
		const { w, d, h } = await dims(page);
		expect(w).toBeGreaterThan(20);
		expect(d).toBe(20);
		expect(h).toBe(20);
	});

	test('the dragged edge snaps to the grid', async ({ page }) => {
		await dragAway(page, 'corner-pp', 53);
		const { w, d } = await dims(page);
		expect(Number.isInteger(w)).toBe(true);
		expect(Number.isInteger(d)).toBe(true);
	});

	test('dragging a corner inwards shrinks the shape', async ({ page }) => {
		await dragAway(page, 'corner-pp', -25);
		const { w, d } = await dims(page);
		expect(w).toBeLessThan(20);
		expect(d).toBeLessThan(20);
	});

	test('a shape cannot be flipped inside out or collapsed to nothing', async ({ page }) => {
		await dragAway(page, 'corner-pp', -400);
		const { w, d } = await dims(page);
		expect(w).toBeGreaterThan(0);
		expect(d).toBeGreaterThan(0);
	});

	test('Shift scales all three dimensions together', async ({ page }) => {
		await dragAway(page, 'corner-pp', 70, { shift: true });
		const { w, d, h } = await dims(page);
		expect(w).toBeGreaterThan(20);
		expect(d).toBeCloseTo(w, 5);
		expect(h).toBeCloseTo(w, 5);
	});

	test('Alt resizes about the centre', async ({ page }) => {
		await dragAway(page, 'corner-pp', 70, { alt: true });
		await expect.poll(async () => (await dims(page)).w).toBeGreaterThan(20);
		await expect.poll(() => num(page, 'X')).toBe(0);
		await expect.poll(() => num(page, 'Y')).toBe(0);
	});

	test('dragging the top handle changes only the height', async ({ page }) => {
		const before = await centerOf(handle(page, 'height'));
		await dragBy(page, 'height', 0, -60);
		const { w, d, h } = await dims(page);
		expect(h).toBeGreaterThan(20);
		expect(w).toBe(20);
		expect(d).toBe(20);
		expect((await centerOf(handle(page, 'height'))).y).toBeLessThan(before.y);
		await expect.poll(() => num(page, 'Z')).toBe(0);
	});

	test('a resize is one undo step', async ({ page }) => {
		await dragAway(page, 'corner-pp', 70);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => dims(page)).toEqual({ w: 20, d: 20, h: 20 });
		await expect.poll(() => num(page, 'X')).toBe(0);
	});

	test('a handle drag leaves the camera and selection alone', async ({ page }) => {
		const cam = await camera(page);
		await dragAway(page, 'side-px', 40);
		expect(await camera(page)).toEqual(cam);
		expect(await selectedNames(page)).toEqual(['Box 1']);
		expect((await objects(page)).length).toBe(1);
	});
});

test.describe('live dimension label', () => {
	test('shows the size while resizing and disappears afterwards', async ({ page }) => {
		const from = await centerOf(handle(page, 'corner-pp'));
		const label = page.getByTestId('dimension-label');
		await expect(label).toHaveCount(0);

		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x + 30, from.y - 30, { steps: 6 });
		await expect(label).toBeVisible();
		await expect(label).toHaveText(/^\d+(\.\d+)? × \d+(\.\d+)? × \d+(\.\d+)? mm$/);
		await page.mouse.up();
		await expect(label).toHaveCount(0);
	});

	test('shows the height above the workplane while lifting', async ({ page }) => {
		const from = await centerOf(handle(page, 'lift'));
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x, from.y - 50, { steps: 6 });
		await expect(page.getByTestId('dimension-label')).toHaveText(/^Z \d+(\.\d+)? mm$/);
		await page.mouse.up();
		await expect(page.getByTestId('dimension-label')).toHaveCount(0);
	});
});

test.describe('lifting and dropping', () => {
	test('dragging the lift handle raises the shape without resizing it', async ({ page }) => {
		await dragBy(page, 'lift', 0, -60);
		await expect.poll(() => num(page, 'Z')).toBeGreaterThan(0);
		expect(Number.isInteger(await num(page, 'Z'))).toBe(true);
		await expect.poll(() => dims(page)).toEqual({ w: 20, d: 20, h: 20 });
		await expect.poll(() => num(page, 'X')).toBe(0);
		await expect.poll(() => num(page, 'Y')).toBe(0);
	});

	test('lifting is one undo step', async ({ page }) => {
		await dragBy(page, 'lift', 0, -60);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => num(page, 'Z')).toBe(0);
	});

	test('a shape can be pushed through the workplane, and the D key brings it back onto it', async ({ page }) => {
		await dragBy(page, 'lift', 0, 200);
		await expect.poll(() => num(page, 'Z')).toBeLessThan(0);
		await page.keyboard.press('d');
		await expect.poll(() => num(page, 'Z')).toBe(0);
	});

	test('the D key drops the shape back onto the workplane', async ({ page }) => {
		await dragBy(page, 'lift', 0, -60);
		await expect.poll(() => num(page, 'Z')).toBeGreaterThan(0);
		await page.keyboard.press('d');
		await expect.poll(() => num(page, 'Z')).toBe(0);
	});

	test('the Drop button does the same', async ({ page }) => {
		await dragBy(page, 'lift', 0, -60);
		await properties(page).getByRole('button', { name: 'Drop to workplane' }).click();
		await expect.poll(() => num(page, 'Z')).toBe(0);
	});

	test('Z can be typed, and a negative value puts the shape partly underground', async ({ page }) => {
		const before = await centerOf(handle(page, 'height'));
		await field(page, 'Z').fill('15');
		await field(page, 'Z').press('Enter');
		await expect(field(page, 'Z')).toHaveValue('15');
		expect((await centerOf(handle(page, 'height'))).y).toBeLessThan(before.y);

		await field(page, 'Z').fill('-3');
		await field(page, 'Z').press('Enter');
		await expect(field(page, 'Z')).toHaveValue('-3');
	});

	test('a lifted shape moves along the plane it is floating at', async ({ page }) => {
		await dragBy(page, 'lift', 0, -60);
		const z = await num(page, 'Z');
		const mid = await centerOf(viewport(page));
		// Grab the floating box by its middle (above the workplane origin) and drag sideways.
		const grab = { x: mid.x, y: (await centerOf(handle(page, 'height'))).y + 20 };
		await drag(page, grab, { x: grab.x + 80, y: grab.y });
		await expect.poll(() => num(page, 'Z')).toBe(z);
		await expect.poll(() => num(page, 'X')).not.toBe(0);
	});
});
