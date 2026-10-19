import http from 'node:http';
import type { AddressInfo } from 'node:net';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { newDesign, openPanel, viewport } from './helpers.ts';

/*
 * Support points for resin printing: Trident's slicer works them out for the design, they show over the model, can be moved, added to and
 * taken away, and go to Trident with the model. Here the Trident is a stand-in in this test process (Holecraft's server talks to it): it
 * answers the four corners of the box's underside as the points, and records what it is sent.
 */

interface Fake {
	url: string;
	asked: { printer: string; authorization: string | undefined; fileName: string }[];
	stored: {
		model: string;
		authorization: string | undefined;
		body: { objects: { points: { x: number; y: number; z: number; radius: number; type: string }[] }[] };
	}[];
	close: () => Promise<void>;
}

const CORNERS = [
	[-5, -5],
	[5, -5],
	[5, 5],
	[-5, 5],
] as const;

async function fakeTrident(): Promise<Fake> {
	const fake: Fake = { url: '', asked: [], stored: [], close: async () => undefined };
	const printers = [
		{ name: 'Elegoo Mars 3', vendor: 'Elegoo', supported: true },
		{ name: 'UniFormation GKtwo', vendor: 'UniFormation', supported: true },
	];
	/** The points for a model, noting what was asked. */
	const supportsFor = (req: http.IncomingMessage, body: Buffer): unknown => {
		const text = body.toString('latin1');
		fake.asked.push({
			printer: /name="printer"\r\n\r\n([^\r]*)/.exec(text)?.[1] ?? '',
			authorization: req.headers.authorization,
			fileName: /filename="([^"]*)"/.exec(text)?.[1] ?? '',
		});
		return { objects: [{ points: CORNERS.map(([x, y]) => ({ x, y, z: 0, radius: 0.4, type: 'island' })) }] };
	};
	/** The points kept for a model, noting what was sent. */
	const keepPoints = (req: http.IncomingMessage, body: Buffer, model: string): unknown => {
		const parsed = JSON.parse(body.toString());
		fake.stored.push({ model, authorization: req.headers.authorization, body: parsed });
		return { model_id: model, filename: 'x.3mf', support_point_count: parsed.objects[0].points.length };
	};
	/** What the GET routes answer: the printers, and the printers saved in Trident. */
	const lists: Record<string, unknown> = {
		'/resin/printers': printers,
		'/resin/saved-printers': [{ name: 'gk2', printer: 'UniFormation GKtwo' }],
	};
	/** What each request is answered with: the printers, the points for a model, a stored model, the points kept for it, or a page. */
	const answer = (req: http.IncomingMessage, body: Buffer): unknown => {
		const url = req.url ?? '';
		if (req.method === 'GET') return lists[url] ?? null;
		if (req.method === 'POST' && url === '/models') return { model_id: 'm42', filename: 'x.3mf' };
		if (req.method === 'POST' && url === '/resin/supports') return supportsFor(req, body);
		const put = /^\/models\/([^/]+)\/support-points$/.exec(url);
		return req.method === 'PUT' && put ? keepPoints(req, body, put[1]!) : null;
	};
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			const reply = answer(req, Buffer.concat(chunks));
			if (reply === null) {
				res.writeHead(200, { 'content-type': 'text/html' });
				res.end('<title>Fake Trident</title><p>Fake Trident</p>');
				return;
			}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify(reply));
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	fake.close = () =>
		new Promise((resolve) => {
			server.closeAllConnections();
			server.close(() => resolve());
		});
	return fake;
}

const resin = (page: Page) => page.getByRole('region', { name: 'Resin' });
const supports = (page: Page) => resin(page).getByRole('group', { name: 'Supports' });
const points = (page: Page) => viewport(page).getByTestId('support-point');
const generate = (page: Page) => supports(page).getByRole('button', { name: /Generate support points|Generating/ });

let fake: Fake;

test.beforeEach(async ({ page, request }) => {
	await request.delete('/api/trident');
	fake = await fakeTrident();
	// every test but the first has a Trident set up (the panel asks the server about it when the editor opens)
	if (!test.info().title.startsWith('is off')) await request.put('/api/trident', { data: { url: fake.url, key: 'trident_k' } });
	await newDesign(page);
	await page.getByRole('button', { name: 'Box', exact: true }).press('Enter');
	await openPanel(page, 'Edit');
});

test.afterEach(async ({ request }) => {
	await fake.close();
	await request.delete('/api/trident');
});

/** Chooses a printer and generates the points. */
async function generated(page: Page) {
	await supports(page).getByLabel('Printer for the points').selectOption('Elegoo Mars 3');
	await generate(page).click();
	await expect(points(page)).toHaveCount(4);
}

test('is off, with the reason, until a Trident is set up', async ({ page }) => {
	await expect(generate(page)).toBeDisabled();
	await expect(supports(page).getByText(/set one up under Export, Send to Trident/)).toBeVisible();
	await expect(points(page)).toHaveCount(0);
});

test('lists the printers saved in Trident first, and starts on the first when none was chosen', async ({ page }) => {
	const picker = supports(page).getByLabel('Printer for the points');
	await expect(picker.locator('optgroup').first()).toHaveAttribute('label', 'Your saved printers');
	await expect(picker.locator('optgroup').first().locator('option')).toHaveText(['gk2 (UniFormation GKtwo)']);
	await expect(picker).toHaveValue('UniFormation GKtwo');
	await generate(page).click();
	await expect(points(page)).toHaveCount(4);
	expect(fake.asked[0]?.printer).toBe('UniFormation GKtwo');
});

test('generates the points for the printer chosen, and shows them over the model', async ({ page }) => {
	await generated(page);
	expect(fake.asked).toEqual([{ printer: 'Elegoo Mars 3', authorization: 'Bearer trident_k', fileName: expect.stringMatching(/\.3mf$/) }]);
	await expect(supports(page).getByText('4 points (from Trident)')).toBeVisible();
	const first = points(page).first();
	await expect(first).toHaveAttribute('data-x', '-5');
	await expect(first).toHaveAttribute('data-y', '-5');
	await expect(first).toHaveAttribute('data-z', '0');
});

test('the points can be hidden and shown again', async ({ page }) => {
	await generated(page);
	await supports(page).getByLabel('Show points').uncheck();
	await expect(points(page)).toHaveCount(0);
	await supports(page).getByLabel('Show points').check();
	await expect(points(page)).toHaveCount(4);
});

test('a point is chosen, its width changed, and it is taken away, each one step to undo', async ({ page }) => {
	await generated(page);
	await points(page).nth(1).click();
	await expect(points(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
	await supports(page).getByLabel('Tip radius').fill('0.8');
	await supports(page).getByLabel('Tip radius').press('Enter');
	await expect(points(page).nth(1)).toHaveAttribute('data-radius', '0.8');
	await supports(page).getByRole('button', { name: 'Delete point' }).click();
	await expect(points(page)).toHaveCount(3);
	await page.keyboard.press('Control+z');
	await expect(points(page)).toHaveCount(4);
	await page.keyboard.press('Control+z');
	await expect(points(page).nth(1)).toHaveAttribute('data-radius', '0.4');
});

test('Delete takes the chosen point away, and Delete all takes every one', async ({ page }) => {
	await generated(page);
	await points(page).first().click();
	await page.keyboard.press('Delete');
	await expect(points(page)).toHaveCount(3);
	await supports(page).getByRole('button', { name: 'Delete all' }).click();
	await expect(points(page)).toHaveCount(0);
	await expect(supports(page).getByLabel('Show points')).toHaveCount(0); // the point controls go with the points
});

test('Add point puts a point where the model is clicked, and says it is yours', async ({ page }) => {
	await generated(page);
	await supports(page).getByRole('button', { name: 'Add point' }).click();
	await expect(supports(page).getByRole('button', { name: 'Add point' })).toHaveAttribute('aria-pressed', 'true');
	const box = (await viewport(page).boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // the middle of the view is on the box
	await expect(points(page)).toHaveCount(5);
	await expect(supports(page).getByText('5 points (4 from Trident, 1 added by you)')).toBeVisible();
	const added = points(page).nth(4);
	const z = Number(await added.getAttribute('data-z'));
	expect(z).toBeGreaterThan(-0.01); // on the box, not under the plane
	expect(z).toBeLessThan(20.01);
	await page.keyboard.press('Escape'); // leaves Add point
	await expect(supports(page).getByRole('button', { name: 'Add point' })).toHaveAttribute('aria-pressed', 'false');
});

test('a point is dragged over the model and stays on its surface', async ({ page }) => {
	await generated(page);
	const point = points(page).first();
	const from = (await point.boundingBox())!;
	const view = (await viewport(page).boundingBox())!;
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2, { steps: 8 });
	await page.mouse.up();
	const x = Number(await points(page).first().getAttribute('data-x'));
	const y = Number(await points(page).first().getAttribute('data-y'));
	const z = Number(await points(page).first().getAttribute('data-z'));
	expect(Math.hypot(x + 5, y + 5)).toBeGreaterThan(1); // it moved
	expect(Math.max(Math.abs(x), Math.abs(y), Math.abs(z - 10))).toBeLessThanOrEqual(10.01); // and is still on the box
	await page.keyboard.press('Control+z');
	await expect(points(page).first()).toHaveAttribute('data-x', '-5'); // one undo step
});

test('says the points are out of date once the box is moved', async ({ page }) => {
	await generated(page);
	await expect(supports(page).getByText(/shape changed since the points were made/)).toHaveCount(0);
	await openPanel(page, 'Objects');
	await page
		.getByTestId('object-list')
		.getByRole('button', { name: /^Box 1 / })
		.click();
	await openPanel(page, 'Edit');
	await page.keyboard.press('ArrowRight');
	await expect(supports(page).getByText(/shape changed since the points were made/)).toBeVisible();
});

test('Send to Trident gives Trident the points, after the model, before opening it', async ({ page }) => {
	await generated(page);
	await points(page).first().click();
	await page.keyboard.press('Delete'); // 3 points left, of the user's choosing
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [popup] = await Promise.all([
		page.waitForEvent('popup'),
		page
			.getByRole('menu', { name: 'Export format' })
			.getByRole('menuitem', { name: /Send to Trident/ })
			.click(),
	]);
	await expect.poll(() => popup.url()).toBe(`${fake.url}/?model=m42`);
	expect(fake.stored).toHaveLength(1);
	expect(fake.stored[0]?.model).toBe('m42');
	expect(fake.stored[0]?.authorization).toBe('Bearer trident_k');
	expect(fake.stored[0]?.body.objects).toHaveLength(1);
	expect(fake.stored[0]?.body.objects[0]?.points).toHaveLength(3);
	await popup.close();
});

test('a design with no points sends none', async ({ page }) => {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [popup] = await Promise.all([
		page.waitForEvent('popup'),
		page
			.getByRole('menu', { name: 'Export format' })
			.getByRole('menuitem', { name: /Send to Trident/ })
			.click(),
	]);
	await expect.poll(() => popup.url()).toBe(`${fake.url}/?model=m42`);
	expect(fake.stored).toHaveLength(0);
	await popup.close();
});

test('the panel and the points over the view pass the accessibility scan, with a point chosen, Add point on and a warning showing', async ({
	page,
}) => {
	await generated(page);
	await points(page).first().click();
	await supports(page).getByRole('button', { name: 'Add point' }).click();
	await page.keyboard.press('ArrowRight'); // moves the box: the points are out of date
	const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
	expect(result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);
});
