import { type APIRequestContext, expect, type Locator, type Page } from '@playwright/test';

export const viewport = (page: Page) => page.getByTestId('viewport');

/** Opens the app, makes a fresh design and waits for the editor to be ready. */
export async function newDesign(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'New design' }).click();
	await expect(viewport(page).locator('canvas')).toBeVisible();
}

/** Makes a design through the API (so a test can open or list it) and returns its id. */
export async function createDesignViaApi(request: APIRequestContext, name?: string): Promise<{ id: string; name: string }> {
	const res = await request.post('/api/designs', { data: name ? { name } : {} });
	expect(res.status()).toBe(201);
	return (await res.json()) as { id: string; name: string };
}

/** A name no other test uses, so tests can find their own designs in a shared list. */
export const uniqueName = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function camera(page: Page) {
	const d = await viewport(page).evaluate((el) => ({ ...(el as HTMLElement).dataset }));
	return {
		azimuth: Number(d.azimuth),
		polar: Number(d.polar),
		distance: Number(d.distance),
		target: JSON.parse(d.target ?? '[0,0,0]') as number[],
		projection: d.projection,
	};
}

/**
 * Shows one of the side panel's parts. In the compact layout (touch screens, narrow windows) the panel is a set of tabs
 * and only one part is on screen; on a desktop every part is always shown, so this does nothing.
 */
export async function openPanel(page: Page, name: 'Shapes' | 'Edit' | 'Colours' | 'Objects') {
	const tab = page.getByRole('tab', { name, exact: true });
	if (await tab.isVisible()) await tab.click();
}

export const properties = (page: Page) => page.getByRole('region', { name: 'Properties' });
export const field = (page: Page, name: string) => properties(page).getByLabel(name, { exact: true });

export async function selectView(page: Page, view: string) {
	await page.getByLabel('Standard views').selectOption(view);
}

export async function center(locator: Locator) {
	const box = await locator.boundingBox();
	if (!box) throw new Error('element has no box');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

const objectRows = (page: Page) => page.getByTestId('object-list').locator('li');

/** Parses "Box 1 (12, -3)" rows from the object list. */
export async function objects(page: Page) {
	const rows = await objectRows(page).allInnerTexts();
	return rows.map((text) => {
		const m = /^(.+?)\s+\((-?[\d.]+), (-?[\d.]+)\)/.exec(text.trim());
		if (!m) throw new Error(`unparseable row: ${text}`);
		return { name: m[1]!, x: Number(m[2]), y: Number(m[3]) };
	});
}

/** Names of the shapes currently selected, in list order. */
export async function selectedNames(page: Page): Promise<string[]> {
	const rows = objectRows(page);
	const out: string[] = [];
	for (let i = 0; i < (await rows.count()); i++) {
		const row = rows.nth(i);
		if ((await row.getAttribute('data-selected')) === 'true') out.push((await row.innerText()).replace(/\s*\(.*$/s, ''));
	}
	return out;
}

/** Adds a shape by dragging it `dx`, `dy` pixels from the centre of the view. */
export async function dropShape(page: Page, shape: 'Box' | 'Cylinder' | 'Sphere', dx = 0, dy = 0) {
	const { box } = await center(viewport(page));
	await page
		.getByRole('button', { name: shape, exact: true })
		.dragTo(viewport(page), { targetPosition: { x: box.width / 2 + dx, y: box.height / 2 + dy } });
}

/**
 * Adds a shape at the origin on the floor, whatever is there: Enter on its tile. (A click on the tile arms it to be placed with the pointer, and a
 * shape dropped over another stands on top of it, so neither makes a shape overlap the one at the centre.)
 */
export async function addAtOrigin(page: Page, shape: string) {
	await page.getByRole('region', { name: 'Shapes' }).getByRole('button', { name: shape, exact: true }).press('Enter');
}

type Pt = { x: number; y: number };

/** Press, move in steps and release with the given mouse button. */
export async function drag(
	page: Page,
	from: Pt,
	to: Pt,
	opts: { button?: 'left' | 'right' | 'middle' | undefined; shift?: boolean | undefined; steps?: number | undefined } = {},
) {
	const { button = 'left', shift = false, steps = 8 } = opts;
	if (shift) await page.keyboard.down('Shift');
	await page.mouse.move(from.x, from.y);
	await page.mouse.down({ button });
	await page.mouse.move(to.x, to.y, { steps });
	await page.mouse.up({ button });
	if (shift) await page.keyboard.up('Shift');
}

/** The colour of one pixel of the page, read from a real screenshot (so it includes WebGL output). */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number]> {
	const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } });
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(image, 0, 0);
		const d = ctx.getImageData(0, 0, 1, 1).data;
		return [d[0]!, d[1]!, d[2]!] as [number, number, number];
	}, png.toString('base64'));
}

/** Waits until the camera has stopped easing (two identical readings in a row). */
export async function cameraSettled(page: Page) {
	let last = '';
	await expect
		.poll(async () => {
			const now = JSON.stringify(await camera(page));
			const same = now === last;
			last = now;
			return same;
		})
		.toBe(true);
}

/** Opens every section of the side panel for this page, unless the test (or a reload) has folded some: Resin starts folded for a new visitor. */
export async function unfoldSections(page: Page) {
	await page.addInitScript(() => {
		if (localStorage.getItem('holecraft.foldedSections') === null) localStorage.setItem('holecraft.foldedSections', '[]');
	});
}
