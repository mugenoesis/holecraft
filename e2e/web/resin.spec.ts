import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, type Page, test } from '@playwright/test';
import { newDesign, openPanel, properties } from './helpers.ts';
import { parseStl } from './meshFiles.ts';

/*
 * The Resin panel: drain and vent holes (ordinary holes, grouped with the shape so they cut) and the tilt buttons. The cut is proved by a
 * real STL export: its volume is the box's less the two round holes, worked out here by hand.
 */

const list = (page: Page) => page.getByTestId('object-list');
const resin = (page: Page) => page.getByRole('region', { name: 'Resin' });

async function exportStl(page: Page) {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL$/ }).click(),
	]);
	return parseStl(await readFile(await download.path()));
}

test.beforeEach(async ({ page }) => {
	await newDesign(page);
	await page.getByRole('button', { name: 'Box', exact: true }).press('Enter'); // a 20 mm box, selected or not
	await openPanel(page, 'Objects');
	await list(page)
		.getByRole('button', { name: /^Box 1 / })
		.click();
	await openPanel(page, 'Edit');
});

test('the panel says what to select when nothing is', async ({ page }) => {
	await page.keyboard.press('Escape');
	await expect(resin(page).getByRole('button', { name: 'Add drain hole' })).toBeDisabled();
	await expect(resin(page).getByRole('button', { name: 'Tilt 30°' })).toBeDisabled();
	await expect(resin(page).getByText('Select one shape or group to add a drain or vent hole to it.')).toBeVisible();
});

test('a drain and a vent hole are added to the box and cut it by their volume', async ({ page }) => {
	await resin(page).getByRole('button', { name: 'Add drain hole' }).click();
	await resin(page).getByRole('button', { name: 'Add vent hole' }).click();
	// both are in the one group the first one made, as ordinary holes
	await openPanel(page, 'Objects');
	await expect(list(page).locator('li')).toHaveCount(1);
	const stl = await exportStl(page);
	const hole = Math.PI * 1.75 ** 2 * 5; // 3.5 mm across, 5 mm inside the box
	// round holes are faceted a little under the true circle
	expect(stl.volume).toBeGreaterThan(8000 - 2 * hole - 1);
	expect(stl.volume).toBeLessThan(8000 - 2 * hole + 1);
});

test('the diameter is the one typed, and undo takes a hole away', async ({ page }) => {
	await resin(page).getByLabel('Diameter').fill('6');
	await resin(page).getByRole('button', { name: 'Add drain hole' }).click();
	await openPanel(page, 'Objects');
	const stl = await exportStl(page);
	const hole = Math.PI * 3 ** 2 * 5;
	expect(stl.volume).toBeGreaterThan(8000 - hole - 2);
	expect(stl.volume).toBeLessThan(8000 - hole + 2);
	await page.keyboard.press('Control+z');
	await expect(list(page).getByRole('button', { name: /^Box 1 / })).toBeVisible();
	expect((await exportStl(page)).volume).toBeCloseTo(8000, 0);
});

test('a diameter a hole cannot be disables the buttons', async ({ page }) => {
	await resin(page).getByLabel('Diameter').fill('0.1');
	await expect(resin(page).getByRole('button', { name: 'Add drain hole' })).toBeDisabled();
	await resin(page).getByLabel('Diameter').fill('3.5');
	await expect(resin(page).getByRole('button', { name: 'Add drain hole' })).toBeEnabled();
});

test('tilting turns the box about X and keeps it on the plane', async ({ page }) => {
	await resin(page).getByRole('button', { name: 'Tilt 45°' }).click();
	await expect(properties(page).getByLabel('Rotate X', { exact: true })).toHaveValue('45');
	const stl = await exportStl(page);
	expect(stl.min[2]).toBeCloseTo(0, 1);
	expect(stl.max[2]).toBeCloseTo(20 * Math.SQRT2, 1); // a cube on its edge
	await resin(page).getByRole('button', { name: 'Tilt 45°' }).click();
	await expect(properties(page).getByLabel('Rotate X', { exact: true })).toHaveValue('90');
});

/*
 * Hollow: the selected shape is sent to a Trident slicer to be hollowed and swapped for what comes back. Here the Trident is a stand-in
 * in this test process (Holecraft's server, in the same container, talks to it) that hollows what it is sent with a wall of the size
 * asked for: the same outside, and a box-shaped cavity inside.
 */
interface FakeTrident {
	url: string;
	asked: { wall: string; quality: string; authorization: string | undefined; fileName: string }[];
	refusal: { status: number; detail: string } | null;
	close: () => Promise<void>;
}

/** The binary STL of a box, every triangle wound outward (or inward for a cavity). */
function boxStl(min: number[], max: number[], inward: boolean): number[][][] {
	const v = (i: number) => [i & 1 ? max[0]! : min[0]!, i & 2 ? max[1]! : min[1]!, i & 4 ? max[2]! : min[2]!];
	const quads = [
		[0, 2, 3, 1],
		[4, 5, 7, 6],
		[0, 1, 5, 4],
		[2, 6, 7, 3],
		[0, 4, 6, 2],
		[1, 3, 7, 5],
	];
	return quads.flatMap(([a, b, c, d]) => {
		const tris = [
			[v(a!), v(b!), v(c!)],
			[v(a!), v(c!), v(d!)],
		];
		return inward ? tris.map(([p, q, r]) => [p!, r!, q!]) : tris;
	});
}

function binaryStl(triangles: number[][][]): Buffer {
	const out = Buffer.alloc(84 + 50 * triangles.length);
	out.writeUInt32LE(triangles.length, 80);
	triangles.forEach((tri, i) => {
		tri.forEach((p, k) => {
			for (let j = 0; j < 3; j++) out.writeFloatLE(p[j]!, 84 + 50 * i + 12 + 12 * k + 4 * j);
		});
	});
	return out;
}

/** What a multipart request holds, by field name. */
function multipartFields(body: Buffer, contentType: string): Map<string, { text: string; data: Buffer; fileName: string }> {
	const boundary = `--${/boundary=(.+)$/.exec(contentType)![1]}`;
	const fields = new Map<string, { text: string; data: Buffer; fileName: string }>();
	let from = body.indexOf(boundary) + boundary.length;
	while (from < body.length) {
		const next = body.indexOf(boundary, from);
		if (next < 0) break;
		const part = body.subarray(from + 2, next - 2); // minus the line breaks round the boundary
		const split = part.indexOf('\r\n\r\n');
		const head = part.subarray(0, split).toString('latin1');
		const data = part.subarray(split + 4);
		fields.set(/name="([^"]+)"/.exec(head)![1]!, {
			text: data.toString('latin1'),
			data,
			fileName: /filename="([^"]*)"/.exec(head)?.[1] ?? '',
		});
		from = next + boundary.length;
	}
	return fields;
}

async function fakeTrident(): Promise<FakeTrident> {
	const fake: FakeTrident = { url: '', asked: [], refusal: null, close: async () => undefined };
	const server = http.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => {
			if (req.method !== 'POST' || req.url !== '/resin/hollow') {
				res.writeHead(404, { 'content-type': 'application/json' });
				res.end('{"detail":"Not Found"}');
				return;
			}
			const fields = multipartFields(Buffer.concat(chunks), String(req.headers['content-type']));
			const wall = Number(fields.get('wall_thickness')?.text);
			fake.asked.push({
				wall: fields.get('wall_thickness')?.text ?? '',
				quality: fields.get('quality')?.text ?? '',
				authorization: req.headers.authorization,
				fileName: fields.get('file')?.fileName ?? '',
			});
			if (fake.refusal) {
				res.writeHead(fake.refusal.status, { 'content-type': 'application/json' });
				res.end(JSON.stringify({ detail: fake.refusal.detail }));
				return;
			}
			const sent = parseStl(fields.get('file')!.data);
			const inner = { min: sent.min.map((v) => v + wall), max: sent.max.map((v) => v - wall) };
			const stl = binaryStl([...boxStl(sent.min, sent.max, false), ...boxStl(inner.min, inner.max, true)]);
			res.writeHead(200, { 'content-type': 'model/stl', 'x-volume-before-mm3': '8000.0', 'x-volume-after-mm3': '3904.0' });
			res.end(stl);
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

test.describe('Hollow', () => {
	let fake: FakeTrident;

	test.beforeEach(async ({ request }) => {
		await request.delete('/api/trident');
		fake = await fakeTrident();
	});

	test.afterEach(async ({ request }) => {
		await fake.close();
		await request.delete('/api/trident');
	});

	const hollowButton = (page: Page) => resin(page).getByRole('button', { name: /Hollow the selected shape|Hollowing/ });

	test('is off, with the reason, until a Trident is set up', async ({ page }) => {
		await expect(hollowButton(page)).toBeDisabled();
		await expect(
			resin(page)
				.getByRole('group', { name: 'Hollow' })
				.getByText(/set one up under Export, Send to Trident/),
		).toBeVisible();
	});

	test('swaps the box for a hollow model of the same size and place, and Undo brings the box back', async ({ page, request }) => {
		await request.put('/api/trident', { data: { url: fake.url, key: 'trident_k' } });
		await page.keyboard.press('Escape');
		await openPanel(page, 'Objects');
		await list(page)
			.getByRole('button', { name: /^Box 1 / })
			.click();
		await openPanel(page, 'Edit');
		await expect(hollowButton(page)).toBeEnabled();
		await resin(page).getByLabel('Wall thickness').fill('3');
		await resin(page).getByLabel('Accuracy').selectOption('fine');
		await hollowButton(page).click();

		await expect(resin(page).getByText(/Hollowed: 8,000 to 3,904 mm³, 51% less resin/)).toBeVisible();
		expect(fake.asked).toEqual([{ wall: '3', quality: '0.75', authorization: 'Bearer trident_k', fileName: 'Untitled design.stl' }]);
		await openPanel(page, 'Objects');
		await expect(list(page).getByRole('button', { name: /^Box 1 \(hollow\) / })).toBeVisible();
		await expect(list(page).locator('li')).toHaveCount(1);

		// the walls are 3 mm: a 14 mm cavity in a 20 mm cube leaves 8000 - 2744; and the box is where it was
		const stl = await exportStl(page);
		expect(stl.volume).toBeGreaterThan(8000 - 2744 - 5);
		expect(stl.volume).toBeLessThan(8000 - 2744 + 5);
		expect(stl.min.map((v) => Math.round(v))).toEqual([-10, -10, 0]);
		expect(stl.max.map((v) => Math.round(v))).toEqual([10, 10, 20]);

		await page.keyboard.press('Control+z');
		await expect(list(page).getByRole('button', { name: /^Box 1 / })).toBeVisible();
		await expect(list(page).getByRole('button', { name: /hollow/ })).toHaveCount(0);
	});

	test('says why when Trident cannot hollow it, and leaves the box alone', async ({ page, request }) => {
		fake.refusal = { status: 422, detail: 'The model is too thin for a wall of 2 mm: there is no room for a cavity.' };
		await request.put('/api/trident', { data: { url: fake.url } });
		await page.keyboard.press('Escape');
		await openPanel(page, 'Objects');
		await list(page)
			.getByRole('button', { name: /^Box 1 / })
			.click();
		await openPanel(page, 'Edit');
		await hollowButton(page).click();
		await expect(resin(page).getByRole('alert')).toContainText('too thin for a wall of 2 mm');
		await openPanel(page, 'Objects');
		await expect(list(page).getByRole('button', { name: /^Box 1 / })).toBeVisible();
		expect((await exportStl(page)).volume).toBeCloseTo(8000, 0);
	});
});
