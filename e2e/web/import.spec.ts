import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import {
	addAtOrigin,
	cameraSettled,
	center,
	dropShape,
	field,
	newDesign,
	objects,
	pixelAt,
	properties,
	selectedNames,
	selectView,
	viewport,
} from './helpers.ts';
import { parseStl, stlCorners } from './meshFiles.ts';
import { boxObj, cube3mf, cubeAsciiStl, cubeObj, cubeStl, flatStl, plateOfThree3mf, slicerPlate3mf, tetraStl } from './modelFiles.ts';

const importInput = (page: Page) => page.getByTestId('import-file');
const list = (page: Page) => page.getByTestId('object-list');
const exportButton = (page: Page) => page.getByRole('button', { name: 'Export', exact: true });

async function importFile(page: Page, name: string, buffer: Buffer) {
	await importInput(page).setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

async function exportStl(page: Page) {
	await exportButton(page).click();
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 30_000 }),
		page.getByRole('menuitem', { name: /as STL/ }).click(),
	]);
	return parseStl(await readFile(await download.path()));
}

async function setFields(page: Page, values: Record<string, string>) {
	for (const [name, value] of Object.entries(values)) {
		await field(page, name).fill(value);
		await field(page, name).press('Enter');
		await expect(field(page, name)).toHaveValue(value);
	}
	await page.getByRole('heading', { name: 'Objects' }).click();
}

const centrePixel = async (page: Page) => {
	const c = await center(viewport(page));
	return pixelAt(page, c.x, c.y);
};

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('the Import button', () => {
	test('is there, and offers STL, OBJ, 3MF and SVG files', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
		expect(await importInput(page).getAttribute('accept')).toBe('.stl,.obj,.3mf,.svg');
	});
});

test.describe('importing a model', () => {
	test('adds a shape named after the file, selected, at its real size on the workplane', async ({ page }) => {
		await importFile(page, 'Bracket.stl', cubeStl(30));
		await expect(list(page).getByRole('button', { name: /Bracket/ })).toBeVisible();
		await expect.poll(() => selectedNames(page)).toEqual(['Bracket']);
		await expect(field(page, 'Width')).toHaveValue('30');
		await expect(field(page, 'Depth')).toHaveValue('30');
		await expect(field(page, 'Height')).toHaveValue('30');
		await expect(field(page, 'X')).toHaveValue('0');
		await expect(field(page, 'Y')).toHaveValue('0');
		await expect(field(page, 'Z')).toHaveValue('0');
	});

	test('reads text STL, OBJ and compressed 3MF files too', async ({ page }) => {
		await importFile(page, 'ascii.stl', cubeAsciiStl(10));
		await importFile(page, 'wavefront.obj', cubeObj(12));
		await importFile(page, 'slicer.3mf', cube3mf(14));
		await expect(list(page).getByRole('button', { name: /ascii/ })).toBeVisible();
		await expect(list(page).getByRole('button', { name: /wavefront/ })).toBeVisible();
		await expect(list(page).getByRole('button', { name: /slicer/ })).toBeVisible();
		await expect(list(page).locator('li')).toHaveCount(3);
	});

	test('reads a 3MF saved by a slicer, whose meshes live in separate files inside it', async ({ page }) => {
		await importFile(page, 'Plate.3mf', slicerPlate3mf(25));
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(list(page).getByRole('button', { name: /Plate/ })).toBeVisible();
		await expect(field(page, 'Width')).toHaveValue('25');
		await expect(field(page, 'Height')).toHaveValue('25');
	});

	test('converts a 3MF in centimetres to millimetres', async ({ page }) => {
		await importFile(page, 'cm.3mf', cube3mf(2, 'centimeter'));
		await expect(field(page, 'Width')).toHaveValue('20');
	});

	test('draws the model', async ({ page }) => {
		await selectView(page, 'top');
		await cameraSettled(page);
		const before = await centrePixel(page);
		await importFile(page, 'Cube.stl', cubeStl(30));
		await expect.poll(() => selectedNames(page)).toEqual(['Cube']);
		await page.keyboard.press('Escape');
		await expect
			.poll(async () => {
				const after = await centrePixel(page);
				return Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1]) + Math.abs(after[2] - before[2]);
			})
			.toBeGreaterThan(40);
	});

	test('moves, resizes and duplicates like any shape', async ({ page }) => {
		await importFile(page, 'Cube.stl', cubeStl(30));
		await setFields(page, { Width: '60', X: '25' });
		await expect.poll(async () => (await objects(page))[0]).toMatchObject({ name: 'Cube', x: 25 });
		await list(page).getByRole('button', { name: /Cube/ }).click();
		await page.keyboard.press('Control+d');
		await expect(list(page).locator('li')).toHaveCount(2);
		await expect(list(page).getByRole('button', { name: /Cube copy/ })).toBeVisible();
	});

	test('can be a hole, undone and redone', async ({ page }) => {
		await importFile(page, 'Cube.stl', cubeStl(30));
		await expect(list(page).locator('li')).toHaveCount(1);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(list(page).locator('li')).toHaveCount(0);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect(list(page).locator('li')).toHaveCount(1);
	});

	test('is still there, drawn and sized, when the design is reopened', async ({ page, request }) => {
		await selectView(page, 'top');
		await cameraSettled(page);
		await importFile(page, 'Cube.stl', cubeStl(30));
		await expect.poll(() => selectedNames(page)).toEqual(['Cube']);
		await expect(page.getByTestId('save-status')).toHaveText('Saved');

		// The design points at a stored model, and the server has it.
		const id = new URL(page.url()).pathname.split('/').pop()!;
		const saved = (await (await request.get(`/api/designs/${id}`)).json()) as { nodes: Record<string, { params: { mesh?: string } }> };
		const ref = Object.values(saved.nodes)[0]!.params.mesh!;
		expect(ref).toMatch(/^[0-9a-f]{64}$/);
		expect((await request.get(`/api/meshes/${ref}`)).status()).toBe(200);

		const downloaded = page.waitForResponse((r) => r.url().endsWith(`/api/meshes/${ref}`));
		await page.reload();
		await downloaded;
		await expect(list(page).getByRole('button', { name: /Cube/ })).toBeVisible();
		await page.keyboard.press('Escape');
		await selectView(page, 'top');
		await cameraSettled(page);
		const pixel = await centrePixel(page);
		expect(pixel[2]).toBeLessThan(250); // not the blank workplane any more
	});
});

test.describe('export and holes', () => {
	test('an imported model exports at its real size and place', async ({ page }) => {
		await importFile(page, 'Cube.stl', cubeStl(30));
		await expect.poll(() => selectedNames(page)).toEqual(['Cube']);
		const stl = await exportStl(page);
		expect(stl.triangles).toBe(12);
		expect(stl.volume).toBeCloseTo(27000, 0);
		expect(stl.min[2]).toBeCloseTo(0, 3);
		expect(stl.max[2]).toBeCloseTo(30, 3);
		expect(stl.min[0]).toBeCloseTo(-15, 3);
	});

	test('a resized model exports at the new size', async ({ page }) => {
		await importFile(page, 'Cube.stl', cubeStl(30));
		await setFields(page, { Width: '60', Height: '10' });
		const stl = await exportStl(page);
		expect(stl.volume).toBeCloseTo(60 * 30 * 10, 0);
	});

	test('a hole drilled through an imported model is cut out of it', async ({ page }) => {
		await importFile(page, 'Cube.stl', cubeStl(30));
		await addAtOrigin(page, 'Cylinder');
		await list(page)
			.getByRole('button', { name: /Cylinder 1/ })
			.click();
		await setFields(page, { Width: '10', Depth: '10', Height: '60' });
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();

		const bore = 0.5 * 64 * 25 * Math.sin((2 * Math.PI) / 64) * 30;
		await expect.poll(async () => Math.abs((await exportStl(page)).volume - (27000 - bore)), { timeout: 20_000 }).toBeLessThan(30);
	});

	test('an imported model can be the hole that cuts another shape', async ({ page }) => {
		await dropShape(page, 'Box');
		await importFile(page, 'Cutter.stl', cubeStl(10));
		await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();
		await expect.poll(async () => (await exportStl(page)).volume, { timeout: 20_000 }).toBeCloseTo(8000 - 1000, 0);
	});

	test('says which model has holes in its surface when it cannot be cut', async ({ page }) => {
		await importFile(page, 'Leaky.stl', cubeStl(30, 2));
		await expect(list(page).getByRole('button', { name: /Leaky/ })).toBeVisible();
		await addAtOrigin(page, 'Cylinder');
		await page.keyboard.press('Control+a');
		await page.getByRole('button', { name: 'Group', exact: true }).click();
		await exportButton(page).click();
		await page.getByRole('menuitem', { name: /as STL/ }).click();
		await expect(page.getByRole('alert')).toContainText(/Leaky.*watertight/);
	});
});

test.describe('files that cannot be imported', () => {
	test('a file of another kind says what can be imported', async ({ page }) => {
		await importFile(page, 'notes.txt', Buffer.from('hello'));
		await expect(page.getByRole('alert')).toContainText('STL, OBJ, 3MF or SVG');
		await expect(list(page).locator('li')).toHaveCount(0);
	});

	test('a flat model says it needs thickness', async ({ page }) => {
		await importFile(page, 'flat.stl', flatStl());
		await expect(page.getByRole('alert')).toContainText(/flat/i);
		await expect(list(page).locator('li')).toHaveCount(0);
	});

	test('a damaged file is refused without breaking anything', async ({ page }) => {
		await importFile(page, 'broken.stl', Buffer.from('this is not an stl file at all'));
		await expect(page.getByRole('alert')).toContainText(/STL/);
		await importFile(page, 'Good.stl', cubeStl(10));
		await expect(list(page).getByRole('button', { name: /Good/ })).toBeVisible();
		await expect(page.getByRole('alert')).toHaveCount(0);
	});

	test('a model that is too big for a shape says so', async ({ page }) => {
		await importFile(page, 'huge.stl', cubeStl(2000));
		await expect(page.getByRole('alert')).toContainText(/too large/i);
	});
});

test.describe('which way is up', () => {
	const up = (page: Page) => page.getByRole('combobox', { name: 'Up axis for imports' });

	test('starts as Z up, which leaves a model as it was made: 10 wide, 20 deep, 30 high', async ({ page }) => {
		await expect(up(page)).toHaveValue('z');
		await importFile(page, 'bar.obj', boxObj(10, 20, 30));
		await list(page).getByRole('button', { name: /^bar/ }).click();
		await expect(field(page, 'Width')).toHaveValue('10');
		await expect(field(page, 'Depth')).toHaveValue('20');
		await expect(field(page, 'Height')).toHaveValue('30');
	});

	test('Y up stands the model upright: the same file comes in 10 wide, 30 deep and 20 high, and is remembered after a reload', async ({
		page,
	}) => {
		await up(page).selectOption('y');
		await importFile(page, 'bar.obj', boxObj(10, 20, 30));
		await list(page).getByRole('button', { name: /^bar/ }).click();
		await expect(field(page, 'Width')).toHaveValue('10');
		await expect(field(page, 'Depth')).toHaveValue('30');
		await expect(field(page, 'Height')).toHaveValue('20');
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await expect(up(page)).toHaveValue('y');
	});

	test('an upright import exports with the volume it had (a turn, not a squash), standing on the plane', async ({ page }) => {
		await up(page).selectOption('y');
		await importFile(page, 'bar.obj', boxObj(10, 20, 30));
		const stl = await exportStl(page);
		expect(stl.volume).toBeCloseTo(10 * 20 * 30, 3);
		expect(stl.min[2]).toBeCloseTo(0, 5);
		expect(stl.max[2]).toBeCloseTo(20, 4);
	});
});

test.describe('flipping an imported model', () => {
	const flipX = (page: Page) => page.getByRole('region', { name: 'Arrange' }).getByRole('button', { name: 'Flip X' });
	async function exportedFile(page: Page) {
		await exportButton(page).click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 30_000 }),
			page.getByRole('menuitem', { name: /as STL/ }).click(),
		]);
		return readFile(await download.path());
	}
	const mirrored = (corners: Set<string>) =>
		new Set(
			[...corners].map((c) =>
				c
					.split(',')
					.map((v, i) => (i === 0 ? (-Number(v) + 0).toFixed(3) : v))
					.join(','),
			),
		);

	test('is allowed: Flip X is on with a model selected', async ({ page }) => {
		await importFile(page, 'wedge.stl', tetraStl());
		await expect(flipX(page)).toBeEnabled();
	});

	test('gives the true mirror image, not a turned copy: the exported corners are the originals with x reversed', async ({ page }) => {
		await importFile(page, 'wedge.stl', tetraStl());
		await expect(list(page).getByRole('button', { name: /^wedge/ })).toBeVisible();
		const before = await exportedFile(page);
		await flipX(page).click();
		const after = await exportedFile(page);
		const [c0, c1] = [stlCorners(before), stlCorners(after)];
		expect(c1).toEqual(mirrored(c0));
		expect(c1).not.toEqual(c0);
		expect(parseStl(after).volume).toBeCloseTo(parseStl(before).volume, 3);
		expect(parseStl(after).volume).toBeGreaterThan(0);
	});

	test('flipped twice it is the original, and undo puts it back after one', async ({ page }) => {
		await importFile(page, 'wedge.stl', tetraStl());
		await expect(list(page).getByRole('button', { name: /^wedge/ })).toBeVisible();
		const original = stlCorners(await exportedFile(page));
		await flipX(page).click();
		await flipX(page).click();
		expect(stlCorners(await exportedFile(page))).toEqual(original);
		await flipX(page).click();
		await page.getByRole('heading', { name: 'Objects' }).click();
		await page.keyboard.press('Control+z');
		expect(stlCorners(await exportedFile(page))).toEqual(original);
	});
});

test.describe('importing an SVG', () => {
	const svg = (body: string, attrs = 'viewBox="0 0 100 100"') =>
		Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`);
	const shape = (page: Page, name: RegExp) => list(page).getByRole('button', { name });

	test('a filled rectangle becomes a solid 5 mm deep, in millimetres, named after the file', async ({ page }) => {
		await importFile(page, 'Plate.svg', svg('<rect x="10" y="10" width="30" height="20"/>'));
		await shape(page, /^Plate/).click();
		await expect(field(page, 'Width')).toHaveValue('30');
		await expect(field(page, 'Depth')).toHaveValue('20');
		await expect(field(page, 'Height')).toHaveValue('5');
		const stl = await exportStl(page);
		expect(stl.volume).toBeCloseTo(30 * 20 * 5, 2);
		expect(stl.min[2]).toBeCloseTo(0, 6);
	});

	test('holes come out as holes: an even-odd frame is the outer area less the inner', async ({ page }) => {
		await importFile(page, 'Frame.svg', svg('<path fill-rule="evenodd" d="M0 0H40V40H0Z M10 10H30V30H10Z"/>'));
		await expect(shape(page, /^Frame/)).toBeVisible();
		expect((await exportStl(page)).volume).toBeCloseTo((1600 - 400) * 5, 2);
	});

	test('curves are read: a circle of radius 10 is about 20 across and exports near its true volume', async ({ page }) => {
		await importFile(page, 'Disc.svg', svg('<circle cx="50" cy="50" r="10"/>'));
		await shape(page, /^Disc/).click();
		await expect(field(page, 'Width')).toHaveValue('20');
		const exact = Math.PI * 100 * 5;
		expect(Math.abs((await exportStl(page)).volume - exact) / exact).toBeLessThan(0.01);
	});

	test('the size in the file is honoured (50 mm for a 100 unit drawing), and the Y up choice does not turn it', async ({ page }) => {
		await page.getByRole('combobox', { name: 'Up axis for imports' }).selectOption('y');
		await importFile(page, 'Half.svg', svg('<rect width="100" height="100"/>', 'width="50mm" height="50mm" viewBox="0 0 100 100"'));
		await shape(page, /^Half/).click();
		await expect(field(page, 'Width')).toHaveValue('50');
		await expect(field(page, 'Height')).toHaveValue('5');
	});

	test('an SVG with nothing filled says why, and adds nothing', async ({ page }) => {
		await importFile(page, 'Lines.svg', svg('<rect width="10" height="10" fill="none" stroke="black"/>'));
		await expect(page.getByRole('alert')).toContainText('no filled shapes');
		await expect(page.getByRole('alert')).toContainText('strokes');
		await expect(page.getByText('Objects: 0')).toBeVisible();
	});

	test('something that is not an SVG says so', async ({ page }) => {
		await importFile(page, 'Nope.svg', Buffer.from('hello'));
		await expect(page.getByRole('alert')).toContainText('not an SVG');
	});

	test('can be resized like any imported model, its thickness included', async ({ page }) => {
		await importFile(page, 'Plate.svg', svg('<rect width="30" height="20"/>'));
		await shape(page, /^Plate/).click();
		await field(page, 'Height').fill('12');
		await field(page, 'Height').press('Enter');
		await page.getByRole('heading', { name: 'Objects' }).click();
		expect((await exportStl(page)).volume).toBeCloseTo(30 * 20 * 12, 2);
	});
});

test.describe('a 3MF with several objects (a slicer’s plate)', () => {
	test('opens each object as a shape of its own, not one joined shape', async ({ page }) => {
		await importFile(page, 'Plate.3mf', plateOfThree3mf());
		await expect(list(page).locator('li')).toHaveCount(3);
		await expect(list(page)).toContainText('Left');
		await expect(list(page)).toContainText('Middle');
		await expect(list(page)).toContainText('Right');
		// all three are selected, ready to move or group together
		await expect(page.getByText('Selected: 3')).toBeVisible();
	});

	test('keeps where they stand: the whole is centred on the plate, and the middle one is still 8 mm up', async ({ page }) => {
		await importFile(page, 'Plate.3mf', plateOfThree3mf());
		await expect(list(page).locator('li')).toHaveCount(3);
		for (const [name, x, z] of [
			['Left', '-40', '0'],
			['Middle', '0', '8'],
			['Right', '40', '0'],
		] as const) {
			await list(page).getByText(name, { exact: false }).first().click();
			await expect(field(page, 'X')).toHaveValue(x);
			await expect(field(page, 'Z')).toHaveValue(z);
		}
	});

	test('are taken away together by one Undo', async ({ page }) => {
		await importFile(page, 'Plate.3mf', plateOfThree3mf());
		await expect(list(page).locator('li')).toHaveCount(3);
		await page.keyboard.press('Control+z');
		await expect(list(page).locator('li')).toHaveCount(0);
	});

	test('are separate solids when exported: three cubes of 10 mm', async ({ page }) => {
		await importFile(page, 'Plate.3mf', plateOfThree3mf());
		await expect(list(page).locator('li')).toHaveCount(3);
		const stl = await exportStl(page);
		expect(stl.volume).toBeCloseTo(3 * 10 ** 3, 0);
	});
});
