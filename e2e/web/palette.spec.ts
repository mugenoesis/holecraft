import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { dropShape, field, newDesign } from './helpers.ts';
import { read3mf } from './meshFiles.ts';

const panel = (page: Page) => page.getByRole('region', { name: 'Colours' });
const swatches = (page: Page) => panel(page).getByRole('button', { name: /^Colour \d+:/ });
const swatch = (page: Page, n: number) => panel(page).getByRole('button', { name: new RegExp(`^Colour ${n}:`) });
const list = (page: Page) => page.getByTestId('object-list');
const selectBox = (page: Page, name: RegExp) => list(page).getByRole('button', { name }).click();
const editInput = (page: Page) => panel(page).getByLabel('Change the chosen colour');
const addButton = (page: Page) => panel(page).getByRole('button', { name: 'Add colour' });
const removeButton = (page: Page) => panel(page).getByRole('button', { name: 'Remove colour' });

const DEFAULTS = ['#f28c28', '#2a9d8f', '#e76f51', '#8d99ae'];

test.beforeEach(async ({ page }) => {
	await newDesign(page);
});

test.describe('the Colours panel', () => {
	test('starts with four colours, the usual multi-material setup', async ({ page }) => {
		await expect(swatches(page)).toHaveCount(4);
		for (const [i, hex] of DEFAULTS.entries()) await expect(swatch(page, i + 1)).toHaveAttribute('aria-label', `Colour ${i + 1}: ${hex}`);
	});

	test('clicking a colour paints the selected shape with it', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await selectBox(page, /Box 1/);
		await swatch(page, 2).click();
		await expect(field(page, 'Color')).toHaveValue('#2a9d8f');
		await swatch(page, 4).click();
		await expect(field(page, 'Color')).toHaveValue('#8d99ae');
	});

	test('clicking a colour with nothing selected changes no shape, and chooses the colour', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await swatch(page, 3).click();
		await expect(swatch(page, 3)).toHaveAttribute('aria-pressed', 'true');
		await expect(swatch(page, 1)).toHaveAttribute('aria-pressed', 'false');
		await selectBox(page, /Box 1/);
		await expect(field(page, 'Color')).toHaveValue('#f28c28'); // still the default orange
	});

	test('changing a colour changes every shape that uses it, so it keeps meaning "this filament"', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await dropShape(page, 'Box', 200, 0);
		await page.getByRole('button', { name: 'Sphere', exact: true }).click(); // a different colour, left alone
		await swatch(page, 1).click(); // choose colour 1
		await editInput(page).fill('#112233');

		await expect(swatch(page, 1)).toHaveAttribute('aria-label', 'Colour 1: #112233');
		await selectBox(page, /Box 1/);
		await expect(field(page, 'Color')).toHaveValue('#112233');
		await selectBox(page, /Box 2/);
		await expect(field(page, 'Color')).toHaveValue('#112233');
		await selectBox(page, /Sphere 1/);
		await expect(field(page, 'Color')).toHaveValue('#e76f51');
	});

	test("undo takes back both the colour and the shapes' colours", async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await swatch(page, 1).click();
		await editInput(page).fill('#112233');
		await expect(swatch(page, 1)).toHaveAttribute('aria-label', 'Colour 1: #112233');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect(swatch(page, 1)).toHaveAttribute('aria-label', 'Colour 1: #f28c28');
		await selectBox(page, /Box 1/);
		await expect(field(page, 'Color')).toHaveValue('#f28c28');
	});

	test('adds colours, up to sixteen', async ({ page }) => {
		await addButton(page).click();
		await expect(swatches(page)).toHaveCount(5);
		for (let i = 0; i < 11; i++) await addButton(page).click();
		await expect(swatches(page)).toHaveCount(16);
		await expect(addButton(page)).toBeDisabled();
		// every colour is different
		const labels = await swatches(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.split(': ')[1]));
		expect(new Set(labels).size).toBe(16);
	});

	test('removes the chosen colour, but never the last one', async ({ page }) => {
		await swatch(page, 2).click();
		await removeButton(page).click();
		await expect(swatches(page)).toHaveCount(3);
		await expect(swatch(page, 2)).toHaveAttribute('aria-label', 'Colour 2: #e76f51');
		for (let i = 0; i < 2; i++) await removeButton(page).click();
		await expect(swatches(page)).toHaveCount(1);
		await expect(removeButton(page)).toBeDisabled();
	});

	test('shapes keep their colour when its slot is removed', async ({ page }) => {
		await dropShape(page, 'Cylinder');
		await swatch(page, 2).click(); // the cylinder's teal
		await removeButton(page).click();
		await selectBox(page, /Cylinder 1/);
		await expect(field(page, 'Color')).toHaveValue('#2a9d8f');
	});

	test('is kept when the design is saved and opened again', async ({ page }) => {
		await addButton(page).click();
		await swatch(page, 1).click();
		await editInput(page).fill('#445566');
		await expect(page.getByTestId('save-status')).toHaveText('Saved');
		await page.reload();
		await expect(swatches(page)).toHaveCount(5);
		await expect(swatch(page, 1)).toHaveAttribute('aria-label', 'Colour 1: #445566');
	});
});

test.describe('exporting for OrcaSlicer', () => {
	async function exportOrca(page: Page) {
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 30_000 }),
			page.getByRole('menuitem', { name: 'Export as 3MF for OrcaSlicer' }).click(),
		]);
		return { fileName: download.suggestedFilename(), parts: read3mf(await readFile(await download.path())) };
	}

	test('is offered in the Export menu', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		await expect(page.getByRole('menuitem', { name: 'Export as 3MF for OrcaSlicer' })).toBeVisible();
	});

	test('writes the palette as filaments and gives each shape the filament of its colour', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click(); // orange: filament 1
		await dropShape(page, 'Cylinder', 200, 0); // teal: filament 2
		await dropShape(page, 'Sphere', -200, 0); // coral: filament 3
		await addButton(page).click(); // a fifth colour, so the list is not just the default four

		const { fileName, parts } = await exportOrca(page);
		expect(fileName).toBe('Untitled design.3mf');
		expect(Object.keys(parts).sort()).toEqual([
			'3D/3dmodel.model',
			'Metadata/model_settings.config',
			'Metadata/project_settings.config',
			'[Content_Types].xml',
			'_rels/.rels',
		]);

		const settings = JSON.parse(parts['Metadata/project_settings.config']!) as Record<string, string[]>;
		expect(settings.filament_colour).toHaveLength(5);
		expect(settings.filament_colour!.slice(0, 4)).toEqual(DEFAULTS.map((c) => c.toUpperCase()));
		expect(settings.filament_type).toEqual(['PLA', 'PLA', 'PLA', 'PLA', 'PLA']); // every per-filament list matches

		const config = parts['Metadata/model_settings.config']!;
		const byName = Object.fromEntries(
			[...config.matchAll(/<metadata key="name" value="([^"]*)"\/>\s*<metadata key="extruder" value="(\d+)"\/>/g)].map((m) => [m[1], m[2]]),
		);
		expect(byName).toEqual({ 'Box 1': '1', 'Cylinder 1': '2', 'Sphere 1': '3' });
	});

	test('a recoloured filament carries through to the file', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await swatch(page, 1).click();
		await editInput(page).fill('#abcdef');
		const { parts } = await exportOrca(page);
		expect((JSON.parse(parts['Metadata/project_settings.config']!) as Record<string, string[]>).filament_colour![0]).toBe('#ABCDEF');
		expect(parts['3D/3dmodel.model']).toContain('displaycolor="#ABCDEFFF"');
	});

	test('the plain 3MF export is still just the model', async ({ page }) => {
		await page.getByRole('button', { name: 'Box', exact: true }).click();
		await page.getByRole('button', { name: 'Export', exact: true }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download', { timeout: 30_000 }),
			page.getByRole('menuitem', { name: /as 3MF$/ }).click(),
		]);
		expect(Object.keys(read3mf(await readFile(await download.path()))).some((n) => n.startsWith('Metadata/'))).toBe(false);
	});
});
