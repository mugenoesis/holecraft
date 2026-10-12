import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { cameraSettled, center, createDesignViaApi, pixelAt, properties, selectView, viewport } from './helpers.ts';

/*
 * Edge treatments (chamfers and rounds on chosen edges). Until the Edge tool exists these tests write the treatment into a
 * saved design through the API, then open it, which also proves the saved format round-trips through the server.
 */

/** The vertical edge at the box's front right corner: between its right (+x) and front (-y) faces. */
const FRONT_RIGHT = {
	points: [
		[10, -10, 0],
		[10, -10, 20],
	],
	normals: [
		[
			[1, 0, 0],
			[0, -1, 0],
		],
	],
};

/** A 20 mm box at the origin, as the app would save it, with the given edge treatments. */
const box = (edges: unknown[]) => ({
	id: 'box1',
	kind: 'shape',
	shapeType: 'box',
	name: 'Box 1',
	transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
	mode: 'solid',
	color: '#f28c28',
	hidden: false,
	locked: false,
	params: { width: 20, depth: 20, height: 20 },
	edges,
});

async function openWith(page: Page, request: APIRequestContext, edges: unknown[]) {
	const { id } = await createDesignViaApi(request);
	const design = await (await request.get(`/api/designs/${id}`)).json();
	design.nodes = { box1: box(edges) };
	design.roots = ['box1'];
	expect((await request.put(`/api/designs/${id}`, { data: design })).status()).toBe(200);
	await page.goto(`/design/${id}`);
	await expect(viewport(page).locator('canvas')).toBeVisible();
}

/** Seen from above at the default zoom (about 2.7 px per mm), 1 mm inside the box's front right corner (x 9, y -9). */
const CORNER = { dx: 24, dy: 24 };

async function blueAtCorner(page: Page) {
	const { x, y } = await center(viewport(page));
	return (await pixelAt(page, x + CORNER.dx, y + CORNER.dy))[2];
}

test.describe('edge treatments', () => {
	test('a chamfered edge on a loose box is drawn: its corner is cut away (seen from above)', async ({ page, request }) => {
		await openWith(page, request, [{ id: 'e1', kind: 'chamfer', size: 6, ...FRONT_RIGHT }]);
		await selectView(page, 'Top');
		await cameraSettled(page);
		await expect.poll(() => blueAtCorner(page), { timeout: 15_000 }).toBeGreaterThan(150); // the pale workplane shows through
	});

	test('the same box without the treatment keeps its corner', async ({ page, request }) => {
		await openWith(page, request, []);
		await selectView(page, 'Top');
		await cameraSettled(page);
		await expect.poll(() => blueAtCorner(page)).toBeLessThan(150);
	});

	test('resizing the box keeps its chamfer on its edge: the corner moves out with it and nothing is reported as lost', async ({
		page,
		request,
	}) => {
		await openWith(page, request, [{ id: 'e1', kind: 'chamfer', size: 6, ...FRONT_RIGHT }]);
		await page.getByTestId('object-list').locator('li').first().locator('button').first().click();
		const width = properties(page).getByLabel('Width', { exact: true });
		await width.fill('40');
		await width.press('Enter');
		await expect(width).toHaveValue('40');
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Escape');
		await selectView(page, 'Top');
		await cameraSettled(page);
		// the box now reaches x = 20, so its front right corner is 1 mm in from there: x 19, y -9 (about 2.7 px per mm)
		const { x, y } = await center(viewport(page));
		await expect.poll(async () => (await pixelAt(page, x + 19 * 2.7, y + 24))[2], { timeout: 15_000 }).toBeGreaterThan(150); // cut away: floor shows through
		await expect(page.getByTestId('skipped-edges')).toHaveCount(0);
	});

	test('a treatment whose edge is gone is reported, not cut, and can be removed (Undo brings it back)', async ({ page, request }) => {
		const gone = {
			...FRONT_RIGHT,
			points: [
				[10, -10, 30],
				[10, -10, 50],
			],
		}; // above the 20 mm box: not one of its edges
		await openWith(page, request, [{ id: 'e1', kind: 'chamfer', size: 6, ...gone }]);
		const notice = page.getByTestId('skipped-edges');
		await expect(notice).toContainText('could not be applied', { timeout: 15_000 });
		await expect(notice).toContainText('Box 1');
		await notice.getByRole('button', { name: 'Remove' }).click();
		await expect(notice).toHaveCount(0);
		await page.keyboard.press('Control+z');
		await expect(page.getByTestId('skipped-edges')).toContainText('could not be applied', { timeout: 15_000 });
	});
});
