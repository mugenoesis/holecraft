import { expect, type Page, test } from '@playwright/test';
import { center, drag, dropShape, field, newDesign, objects, properties, selectedNames, viewport } from './helpers.ts';

const groupButton = (page: Page) => page.getByRole('button', { name: 'Group', exact: true });
const ungroupButton = (page: Page) => page.getByRole('button', { name: 'Ungroup', exact: true });
const typeButton = (page: Page, name: 'Solid' | 'Hole') => properties(page).getByRole('button', { name, exact: true });
const rows = (page: Page) => page.getByTestId('object-list').locator('li');

async function at(page: Page, dx = 0, dy = 0) {
	const { x, y } = await center(viewport(page));
	return { x: x + dx, y: y + dy };
}

async function click(page: Page, dx = 0, dy = 0) {
	const p = await at(page, dx, dy);
	await page.mouse.click(p.x, p.y);
}

/** A box at the origin and a sphere 200 px to its right, both selected. */
async function twoSelected(page: Page) {
	await dropShape(page, 'Box');
	await dropShape(page, 'Sphere', 200, 0);
	await page.keyboard.press('Control+a');
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('grouping', () => {
	test('the Group and Ungroup buttons start disabled', async ({ page }) => {
		await expect(groupButton(page)).toBeDisabled();
		await expect(ungroupButton(page)).toBeDisabled();
	});

	test('Group needs at least two shapes selected', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await click(page);
		await expect(groupButton(page)).toBeDisabled();
		await page.keyboard.press('Control+a');
		await expect(groupButton(page)).toBeEnabled();
	});

	test('grouping makes one object and selects it', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		expect(await selectedNames(page)).toEqual(['Group 1']);
		await expect(properties(page)).toContainText('Contains 2 shapes');
		await expect(ungroupButton(page)).toBeEnabled();
		await expect(groupButton(page)).toBeDisabled();
	});

	test('a group has rotation fields, rings, resize handles and size fields', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await expect(field(page, 'Name')).toHaveValue('Group 1');
		for (const name of ['Width', 'Depth', 'Height']) await expect(properties(page).getByLabel(name, { exact: true })).toBeEnabled();
		await expect(properties(page).getByLabel('Rotate Z', { exact: true })).toBeVisible();
		await expect(page.getByTestId('handle-corner-pp')).toBeVisible();
		await expect(page.getByTestId('handle-height')).toBeVisible();
		await expect(page.getByTestId(/^rotate-/)).toHaveCount(3);
	});

	test('typing a rotation turns the whole group about its middle, and undo brings it back', async ({ page }) => {
		await twoSelected(page);
		const spots = async () =>
			(await page.getByTestId('object-list').locator('li').allInnerTexts()).map((t) =>
				t
					.match(/\((-?[\d.]+), (-?[\d.]+)\)/)!
					.slice(1)
					.map(Number),
			);
		const [[ax, ay], [bx, by]] = (await spots()) as [[number, number], [number, number]];
		expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThan(20);

		await groupButton(page).click();
		await field(page, 'Rotate Z').fill('90');
		await field(page, 'Rotate Z').press('Enter');
		await expect(field(page, 'Rotate Z')).toHaveValue('90');
		await ungroupButton(page).click(); // the shapes keep where the turn put them
		await expect(page.getByText('Objects: 2')).toBeVisible();
		const [[cx, cy], [dx, dy]] = (await spots()) as [[number, number], [number, number]];
		// the offset between the two has turned a quarter (x, y) -> (-y, x), and its length is unchanged
		expect(cx - dx).toBeCloseTo(-(ay - by), 0);
		expect(cy - dy).toBeCloseTo(ax - bx, 0);
		expect((ax + bx) / 2).toBeCloseTo((cx + dx) / 2, 0); // about the same middle
		expect((ay + by) / 2).toBeCloseTo((cy + dy) / 2, 0);
	});

	test('dragging a ring handle turns the group in snapped steps, as one undo step', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		const handle = page.getByTestId('rotate-z');
		const from = await center(handle);
		await drag(page, from, { x: from.x + 70, y: from.y + 50 }, { steps: 12 });
		const angle = Number(await field(page, 'Rotate Z').inputValue());
		expect(angle).not.toBe(0);
		expect(((angle % 22.5) + 22.5) % 22.5).toBeLessThan(0.01); // snapped to 22.5 degree steps
		await page.keyboard.press('Control+z');
		await expect(field(page, 'Rotate Z')).toHaveValue('0');
	});

	test('dragging a resize handle stretches the group and what is in it, as one undo step', async ({ page }) => {
		await twoSelected(page);
		const widthOfFirst = async () => {
			await page.getByTestId('object-list').locator('li').first().locator('button').first().click();
			return Number(await field(page, 'Width').inputValue());
		};
		expect(await widthOfFirst()).toBe(20);
		await page.keyboard.press('Control+a');
		await groupButton(page).click();
		const handle = page.getByTestId('handle-side-px');
		const from = await center(handle);
		await drag(page, from, { x: from.x + 60, y: from.y }, { steps: 12 });
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await ungroupButton(page).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		expect(await widthOfFirst()).toBeGreaterThan(20.5); // stretched along with the group
		// ungrouping and the stretch are separate undo steps: undo the ungroup, then the stretch
		await page.keyboard.press('Escape');
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await ungroupButton(page).click();
		expect(await widthOfFirst()).toBe(20);
	});

	test('a tipped group keeps its resize and lift handles, and they work along its own axes', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await field(page, 'Rotate X').fill('40');
		await field(page, 'Rotate X').press('Enter');
		for (const id of ['corner-pp', 'side-px', 'side-py', 'height', 'lift']) await expect(page.getByTestId(`handle-${id}`)).toBeVisible();
		await expect(properties(page)).not.toContainText(/quarter turns/);
		const width = async () => Number(await field(page, 'Width').inputValue());
		const w0 = await width();
		const depth0 = Number(await field(page, 'Depth').inputValue());
		const a = await center(page.getByTestId('handle-side-px'));
		const b = await center(page.getByTestId('handle-side-nx'));
		const dx = a.x - (a.x + b.x) / 2 + (a.x - b.x) / 2;
		const dy = a.y - (a.y + b.y) / 2 + (a.y - b.y) / 2;
		const len = Math.hypot(dx, dy) || 1;
		await drag(page, a, { x: a.x + (dx / len) * 60, y: a.y + (dy / len) * 60 }, { steps: 12 });
		await expect.poll(width).toBeGreaterThan(w0 + 1);
		expect(Number(await field(page, 'Depth').inputValue())).toBeCloseTo(depth0, 4);
		expect(Number(await field(page, 'Rotate X').inputValue())).toBeCloseTo(40, 4);
	});

	test('a group holding a shape turned at an odd angle is stretched as a whole, which cannot then be split back into shapes', async ({
		page,
	}) => {
		await twoSelected(page);
		await page.getByTestId('object-list').locator('li').first().locator('button').first().click();
		await field(page, 'Rotate Z').fill('45');
		await field(page, 'Rotate Z').press('Enter');
		await page.getByText('Objects: 2').click(); // take the focus out of the field so the keys below are shortcuts
		await page.keyboard.press('Control+a');
		await groupButton(page).click();
		await expect(field(page, 'Name')).toHaveValue('Group 1');
		await expect(page.getByTestId('handle-side-px')).toBeVisible(); // it keeps its handles whatever is inside it
		await expect(ungroupButton(page)).toBeEnabled();

		const width = async () => Number(await field(page, 'Width').inputValue());
		const depth = async () => Number(await field(page, 'Depth').inputValue());
		const w0 = await width();
		const d0 = await depth();
		const from = await center(page.getByTestId('handle-side-px'));
		await drag(page, from, { x: from.x + 70, y: from.y }, { steps: 12 });
		await expect.poll(width).toBeGreaterThan(w0 + 1);
		expect(await depth()).toBeCloseTo(d0, 4);
		await expect(page.getByText('Objects: 1')).toBeVisible();

		// stretched with a turned shape inside, it cannot be taken apart without distorting that shape
		await expect(ungroupButton(page)).toBeDisabled();
		await expect(properties(page)).toContainText(/stretched/);

		await page.getByRole('button', { name: 'Undo' }).click(); // one undo step takes the stretch off again
		await expect.poll(width).toBeCloseTo(w0, 4);
		await expect(ungroupButton(page)).toBeEnabled();
	});

	test('undoing a group turn puts the angle back', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await field(page, 'Rotate Z').fill('90');
		await field(page, 'Rotate Z').press('Enter');
		await expect(field(page, 'Rotate Z')).toHaveValue('90');
		await page.keyboard.press('Escape');
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await page.keyboard.press('Control+z');
		await expect(field(page, 'Rotate Z')).toHaveValue('0');
	});

	test('Ctrl+G groups and Ctrl+Shift+G ungroups', async ({ page }) => {
		await twoSelected(page);
		await page.keyboard.press('Control+g');
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await page.keyboard.press('Control+Shift+g');
		await expect(page.getByText('Objects: 2')).toBeVisible();
	});

	test('Ctrl+G does nothing with a single shape', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await page.keyboard.press('Control+g');
		await expect(page.getByText('Objects: 1')).toBeVisible();
		expect(await selectedNames(page)).toEqual(['Box 1']);
	});

	test('ungrouping gives back the same shapes in the same places, selected', async ({ page }) => {
		await twoSelected(page);
		const before = await objects(page);
		await groupButton(page).click();
		await ungroupButton(page).click();
		expect(await objects(page)).toEqual(before);
		expect(await selectedNames(page)).toEqual(['Box 1', 'Sphere 1']);
	});

	test('grouping and ungrouping are each one undo step', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		// Redo brings the group back but not the selection, so pick it before ungrouping.
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await ungroupButton(page).click();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});

	test('groups can be renamed', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await field(page, 'Name').fill('Bracket');
		await field(page, 'Name').press('Enter');
		expect((await objects(page))[0]!.name).toBe('Bracket');
	});

	test('groups nest, and ungrouping opens one level at a time', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await dropShape(page, 'Cylinder', -200, 0);
		const list = page.getByTestId('object-list');
		await list.getByRole('button', { name: /Box 1/ }).click();
		await list.getByRole('button', { name: /Sphere 1/ }).click({ modifiers: ['Shift'] });
		await groupButton(page).click();
		await list.getByRole('button', { name: /Group 1/ }).click();
		await list.getByRole('button', { name: /Cylinder 1/ }).click({ modifiers: ['Shift'] });
		await groupButton(page).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await expect(properties(page)).toContainText('Contains 3 shapes');

		await ungroupButton(page).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
		expect((await objects(page)).map((o) => o.name).sort()).toEqual(['Cylinder 1', 'Group 1']);
	});
});

test.describe('working with groups', () => {
	test('clicking any shape in a group selects the whole group', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await page.keyboard.press('Escape');
		await click(page, 200, 0);
		expect(await selectedNames(page)).toEqual(['Group 1']);
		await page.keyboard.press('Escape');
		await click(page);
		expect(await selectedNames(page)).toEqual(['Group 1']);
	});

	test('a marquee selects a group', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await page.keyboard.press('Escape');
		await drag(page, await at(page, -100, -150), await at(page, 330, 150));
		expect(await selectedNames(page)).toEqual(['Group 1']);
	});

	test('dragging a group moves everything in it together', async ({ page }) => {
		await twoSelected(page);
		const before = await objects(page);
		await groupButton(page).click();
		await drag(page, await at(page), await at(page, 0, 70));
		await ungroupButton(page).click();
		const after = await objects(page);
		const dy = after[0]!.y - before[0]!.y;
		expect(Math.abs(dy)).toBeGreaterThan(10);
		expect(after[1]!.y - before[1]!.y).toBeCloseTo(dy, 5);
		expect(after[1]!.x - before[1]!.x).toBeCloseTo(after[0]!.x - before[0]!.x, 5);
	});

	test('arrow keys nudge a group', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		const before = (await objects(page))[0]!;
		await page.keyboard.press('Shift+ArrowRight');
		const after = (await objects(page))[0]!;
		expect(after.x - before.x).toBeCloseTo(10, 5);
	});

	test('deleting a group deletes what is inside it, and undo brings it all back', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await page.keyboard.press('Delete');
		await expect(page.getByText('Objects: 0')).toBeVisible();
		await page.keyboard.press('Control+z');
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Group 1/ })
			.click();
		await ungroupButton(page).click();
		await expect(page.getByText('Objects: 2')).toBeVisible();
	});

	test('duplicating a group copies everything in it', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await page.keyboard.press('Control+d');
		await expect(page.getByText('Objects: 2')).toBeVisible();
		expect(await selectedNames(page)).toEqual(['Group 2']);
		await page.keyboard.press('Control+a');
		await ungroupButton(page).click();
		await expect(page.getByText('Objects: 4')).toBeVisible();
	});

	test('recolouring a group recolours everything in it', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await field(page, 'Color').fill('#00ff88');
		await ungroupButton(page).click();
		await expect(rows(page).nth(0)).toHaveAttribute('data-color', '#00ff88');
		await expect(rows(page).nth(1)).toHaveAttribute('data-color', '#00ff88');
	});

	test('the Objects list shows a group by its middle', async ({ page }) => {
		await twoSelected(page);
		const [box, sphere] = await objects(page);
		await groupButton(page).click();
		const [group] = await objects(page);
		expect(group!.x).toBeCloseTo((box!.x + sphere!.x) / 2, 0);
	});

	test('a group can be dropped to the workplane', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await page.keyboard.press('d');
		await expect(page.getByText('Objects: 1')).toBeVisible();
	});
});

test.describe('solid and hole', () => {
	test('a shape is solid to begin with', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await expect(typeButton(page, 'Solid')).toHaveAttribute('aria-pressed', 'true');
		await expect(typeButton(page, 'Hole')).toHaveAttribute('aria-pressed', 'false');
		await expect(rows(page).first()).toHaveAttribute('data-mode', 'solid');
	});

	test('can be turned into a hole and back', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await typeButton(page, 'Hole').click();
		await expect(typeButton(page, 'Hole')).toHaveAttribute('aria-pressed', 'true');
		await expect(rows(page).first()).toHaveAttribute('data-mode', 'hole');
		await typeButton(page, 'Solid').click();
		await expect(rows(page).first()).toHaveAttribute('data-mode', 'solid');
	});

	test('keeps its colour while a hole', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await field(page, 'Color').fill('#123456');
		await typeButton(page, 'Hole').click();
		await typeButton(page, 'Solid').click();
		await expect(rows(page).first()).toHaveAttribute('data-color', '#123456');
	});

	test('applies to every selected shape, and shows neither as pressed when mixed', async ({ page }) => {
		await twoSelected(page);
		await typeButton(page, 'Hole').click();
		await expect(rows(page).nth(0)).toHaveAttribute('data-mode', 'hole');
		await expect(rows(page).nth(1)).toHaveAttribute('data-mode', 'hole');

		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Sphere 1/ })
			.click();
		await typeButton(page, 'Solid').click();
		await page.keyboard.press('Control+a');
		await expect(typeButton(page, 'Solid')).toHaveAttribute('aria-pressed', 'false');
		await expect(typeButton(page, 'Hole')).toHaveAttribute('aria-pressed', 'false');
	});

	test('is one undo step', async ({ page }) => {
		await dropShape(page, 'Box');
		await click(page);
		await typeButton(page, 'Hole').click();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(rows(page).first()).toHaveAttribute('data-mode', 'solid');
	});

	test('a solid and a hole can be grouped together', async ({ page }) => {
		await dropShape(page, 'Box');
		await dropShape(page, 'Sphere', 200, 0);
		await page
			.getByTestId('object-list')
			.getByRole('button', { name: /Sphere 1/ })
			.click();
		await typeButton(page, 'Hole').click();
		await page.keyboard.press('Control+a');
		await groupButton(page).click();
		await expect(page.getByText('Objects: 1')).toBeVisible();
		await ungroupButton(page).click();
		await expect(rows(page).nth(0)).toHaveAttribute('data-mode', 'solid');
		await expect(rows(page).nth(1)).toHaveAttribute('data-mode', 'hole');
	});

	test('a hole group turns what is inside it into holes when ungrouped', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		await typeButton(page, 'Hole').click();
		await expect(rows(page).first()).toHaveAttribute('data-mode', 'hole');
		await ungroupButton(page).click();
		await expect(rows(page).nth(0)).toHaveAttribute('data-mode', 'hole');
		await expect(rows(page).nth(1)).toHaveAttribute('data-mode', 'hole');
	});
});

test.describe('typing a group’s size', () => {
	test('typing a size stretches what is inside to fit, keeps the middle, and is one undo step', async ({ page }) => {
		await twoSelected(page);
		await groupButton(page).click();
		const size = (name: string) => properties(page).getByLabel(name, { exact: true });
		const [width, depth, height] = [size('Width'), size('Depth'), size('Height')] as const;
		const before = Number(await width.inputValue());
		const deep = await depth.inputValue();
		await expect(height).toHaveValue('20');
		await width.fill(String(before * 2));
		await width.press('Enter');
		await expect(width).toHaveValue(String(before * 2));
		await expect(depth).toHaveValue(deep);
		await height.fill('40');
		await height.press('Enter');
		await expect(height).toHaveValue('40');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+z');
		await expect(height).toHaveValue('20');
		await expect(width).toHaveValue(String(before * 2));
		await page.keyboard.press('Control+z');
		await expect(width).toHaveValue(String(before));
	});

	test('a group holding a thread has the size fields switched off, and says why', async ({ page }) => {
		await page.getByRole('region', { name: 'Shapes' }).getByRole('button', { name: 'Threaded Rod', exact: true }).click();
		await dropShape(page, 'Box', 200, 0);
		await page.keyboard.press('Control+a');
		await groupButton(page).click();
		for (const name of ['Width', 'Depth', 'Height']) await expect(properties(page).getByLabel(name, { exact: true })).toBeDisabled();
		await expect(properties(page)).toContainText('thread');
		await expect(page.getByTestId('handle-corner-pp')).toHaveCount(0);
	});
});
