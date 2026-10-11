import { expect, type Locator, type Page, test } from '@playwright/test';
import { camera, center, drag, dropShape, field, newDesign, objects, selectedNames, viewport } from './helpers.ts';

const rotate = (page: Page, axis: 'x' | 'y' | 'z') => page.getByTestId(`rotate-${axis}`);
const handle = (page: Page, id: string) => page.getByTestId(`handle-${id}`);

const centerOf = async (locator: Locator) => {
	const { x, y } = await center(locator);
	return { x, y };
};

const num = (page: Page, name: string) => async () => Number(await field(page, name).inputValue());
const rot = (page: Page, axis: 'X' | 'Y' | 'Z') => num(page, `Rotate ${axis}`);

async function type(page: Page, name: string, value: string) {
	await field(page, name).fill(value);
	await field(page, name).press('Enter');
}

/**
 * Drag a ring handle sideways around the ring: perpendicular to the line from the shape's middle
 * (roughly half way up the top handle) to the handle, which follows the ring whichever way it faces.
 */
async function dragAround(page: Page, axis: 'x' | 'y' | 'z', px: number, opts: { shift?: boolean } = {}) {
	const from = await centerOf(rotate(page, axis));
	const base = await centerOf(viewport(page));
	const top = await centerOf(handle(page, 'height'));
	const mid = { x: (base.x + top.x) / 2, y: (base.y + top.y) / 2 };
	const dx = from.x - mid.x;
	const dy = from.y - mid.y;
	const len = Math.hypot(dx, dy) || 1;
	const to = { x: from.x + (-dy / len) * px, y: from.y + (dx / len) * px };
	await drag(page, from, to, { shift: opts.shift, steps: 12 });
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
	await dropShape(page, 'Box');
	const mid = await centerOf(viewport(page));
	await page.mouse.click(mid.x, mid.y);
	await expect(field(page, 'Width')).toHaveValue('20');
});

test.describe('rotation handles', () => {
	test('a single selected shape shows a ring handle for each axis', async ({ page }) => {
		for (const axis of ['x', 'y', 'z'] as const) await expect(rotate(page, axis)).toBeVisible();
		await expect(page.getByTestId('rotation-rings')).toBeVisible();
	});

	test('they have accessible names', async ({ page }) => {
		await expect(rotate(page, 'x')).toHaveAttribute('aria-label', /rotate.*x/i);
		await expect(rotate(page, 'y')).toHaveAttribute('aria-label', /rotate.*y/i);
		await expect(rotate(page, 'z')).toHaveAttribute('aria-label', /rotate.*z/i);
	});

	test('none with nothing, or several shapes, selected', async ({ page }) => {
		await page.keyboard.press('Escape');
		await expect(page.getByTestId(/^rotate-/)).toHaveCount(0);
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await expect(page.getByTestId(/^rotate-/)).toHaveCount(0);
		await expect(page.getByTestId('rotation-rings')).toHaveCount(0);
	});
});

test.describe('typed rotation', () => {
	test('starts at zero', async ({ page }) => {
		for (const a of ['X', 'Y', 'Z'] as const) await expect(field(page, `Rotate ${a}`)).toHaveValue('0');
	});

	test('turning about Z keeps the shape where it is and the same size', async ({ page }) => {
		await type(page, 'Rotate Z', '45');
		await expect(field(page, 'Rotate Z')).toHaveValue('45');
		expect(await num(page, 'X')()).toBeCloseTo(0, 5);
		expect(await num(page, 'Y')()).toBeCloseTo(0, 5);
		expect(await num(page, 'Z')()).toBeCloseTo(0, 5);
		expect([await num(page, 'Width')(), await num(page, 'Depth')(), await num(page, 'Height')()]).toEqual([20, 20, 20]);
	});

	test("tipping over turns about the shape's middle, so its base point shifts", async ({ page }) => {
		await type(page, 'Rotate X', '45');
		await expect(field(page, 'Rotate X')).toHaveValue('45');
		// The centre is fixed at 10 mm up, so the base point drops to 10 − 10·cos 45°.
		expect(await num(page, 'Z')()).toBeCloseTo(10 - 10 * Math.SQRT1_2, 2);
	});

	test('angles are normalised', async ({ page }) => {
		await type(page, 'Rotate Z', '400');
		await expect(field(page, 'Rotate Z')).toHaveValue('40');
	});

	test('blank and non-numeric input is rejected', async ({ page }) => {
		await type(page, 'Rotate Z', '30');
		await type(page, 'Rotate Z', '');
		await expect(field(page, 'Rotate Z')).toHaveValue('30');
	});

	test('is one undo step', async ({ page }) => {
		await type(page, 'Rotate Z', '60');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(field(page, 'Rotate Z')).toHaveValue('0');
	});

	test('is kept when the shape is duplicated', async ({ page }) => {
		await type(page, 'Rotate Z', '30');
		await page.keyboard.press('Escape');
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		await page.keyboard.press('Control+d');
		expect(await selectedNames(page)).toEqual(['Box 2']);
		await expect(field(page, 'Rotate Z')).toHaveValue('30');
	});

	test('rotation fields are not offered for a multi-selection', async ({ page }) => {
		await dropShape(page, 'Sphere', 200, 0);
		await page.keyboard.press('Control+a');
		await expect(page.getByLabel('Rotate Z', { exact: true })).toHaveCount(0);
	});
});

test.describe('dragging a ring', () => {
	test('turns the shape in 22.5° steps, about the world axis of that ring', async ({ page }) => {
		for (const [axis, name] of [
			['z', 'Rotate Z'],
			['x', 'Rotate X'],
			['y', 'Rotate Y'],
		] as const) {
			await dragAround(page, axis, 70);
			const value = await rot(page, name.slice(-1) as 'X' | 'Y' | 'Z')();
			expect(Math.abs(value), `${name} after dragging its ring`).toBeGreaterThanOrEqual(22.5);
			expect(Math.abs(value % 22.5) < 1e-6 || Math.abs((value % 22.5) - 22.5) < 1e-6, `${name}=${value} should be a multiple of 22.5`).toBe(
				true,
			);
			// Undo the turn so the next axis starts from an upright shape.
			await page.getByRole('button', { name: 'Undo' }).click();
			await expect(field(page, name)).toHaveValue('0');
		}
	});

	test('Shift allows fine, 1° steps', async ({ page }) => {
		await dragAround(page, 'z', 23, { shift: true });
		const value = await rot(page, 'Z')();
		expect(value).not.toBe(0);
		expect(Number.isInteger(value)).toBe(true);
	});

	test('keeps the shape in place and the same size while turning about Z', async ({ page }) => {
		await dragAround(page, 'z', 70);
		expect(await num(page, 'X')()).toBeCloseTo(0, 4);
		expect(await num(page, 'Y')()).toBeCloseTo(0, 4);
		expect(await num(page, 'Width')()).toBe(20);
	});

	test('is a single undo step', async ({ page }) => {
		await dragAround(page, 'z', 70);
		expect(await rot(page, 'Z')()).not.toBe(0);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(field(page, 'Rotate Z')).toHaveValue('0');
	});

	test('shows the angle while dragging and removes it afterwards', async ({ page }) => {
		const from = await centerOf(rotate(page, 'z'));
		const label = page.getByTestId('dimension-label');
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(from.x + 40, from.y + 10, { steps: 8 });
		await expect(label).toBeVisible();
		await expect(label).toHaveText(/^Rotate Z: -?\d+(\.\d+)?°$/);
		await page.mouse.up();
		await expect(label).toHaveCount(0);
	});

	test('leaves the camera and the selection alone', async ({ page }) => {
		const cam = await camera(page);
		await dragAround(page, 'z', 60);
		expect(await camera(page)).toEqual(cam);
		expect(await selectedNames(page)).toEqual(['Box 1']);
		expect((await objects(page)).length).toBe(1);
	});
});

test.describe('turned shapes', () => {
	test('resize handles follow a shape turned about Z', async ({ page }) => {
		const sideY = await centerOf(handle(page, 'side-py'));
		await type(page, 'Rotate Z', '90');
		// Turned a quarter turn, the +X side now stands where the +Y side was.
		await expect
			.poll(async () => {
				const p = await centerOf(handle(page, 'side-px'));
				return Math.hypot(p.x - sideY.x, p.y - sideY.y);
			})
			.toBeLessThan(3);
	});

	test('a turned shape can still be resized along its own axes', async ({ page }) => {
		await type(page, 'Rotate Z', '90');
		const from = await centerOf(handle(page, 'side-px'));
		const mid = await centerOf(viewport(page));
		const dx = from.x - mid.x;
		const dy = from.y - mid.y;
		const len = Math.hypot(dx, dy) || 1;
		await drag(page, from, { x: from.x + (dx / len) * 50, y: from.y + (dy / len) * 50 });
		await expect.poll(num(page, 'Width')).toBeGreaterThan(20);
		expect(await num(page, 'Depth')()).toBe(20);
		expect(await rot(page, 'Z')()).toBeCloseTo(90, 6);
	});

	test('a tipped shape hides its resize and lift handles, and says why', async ({ page }) => {
		await type(page, 'Rotate X', '30');
		await expect(page.getByTestId('handle-corner-pp')).toHaveCount(0);
		await expect(page.getByTestId('handle-lift')).toHaveCount(0);
		await expect(rotate(page, 'x')).toBeVisible();
		await expect(page.getByRole('region', { name: 'Properties' })).toContainText(/tilted/i);

		await type(page, 'Rotate X', '0');
		await expect(page.getByTestId('handle-corner-pp')).toBeVisible();
	});

	test('dropping a tipped shape rests its lowest corner on the workplane', async ({ page }) => {
		await type(page, 'Rotate X', '45');
		await page.keyboard.press('Escape');
		await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
		await page.keyboard.press('d');
		// Centre 14.14 mm from the lowest corner, base point 10·cos 45° above... see rotation-edit unit tests.
		await expect.poll(num(page, 'Z')).toBeCloseTo(7.07, 1);
	});
});
