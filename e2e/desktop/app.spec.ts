import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { pixelAt } from '../web/helpers.ts';
import { cube3mf } from '../web/modelFiles.ts';

// Tests the packaged app (apps/desktop/release/linux-unpacked), not the dev build,
// so packaging mistakes such as missing resources are caught.
const executablePath = path.resolve(import.meta.dirname, '../../apps/desktop/release/linux-unpacked/holecraft');

test.describe('desktop app', () => {
	test.skip(!existsSync(executablePath), 'Package the desktop app first (scripts/package-desktop.sh)');

	let dataDir: string;
	test.beforeEach(() => {
		dataDir = mkdtempSync(path.join(os.tmpdir(), 'holecraft-desktop-'));
	});
	test.afterEach(() => {
		rmSync(dataDir, { recursive: true, force: true });
	});

	test('opens a window running the editor against its embedded server', async () => {
		const app = await electron.launch({
			executablePath,
			// CI containers have no GPU; use Chromium's software WebGL.
			args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
			env: { ...process.env, HOLECRAFT_DATA_DIR: dataDir },
		});
		try {
			const win = await app.firstWindow();
			await win.waitForLoadState('load');
			expect(win.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

			// The app opens on the list of designs; make one to get to the editor.
			await expect(win.getByRole('status')).toHaveText(/Server v\d+\.\d+\.\d+/);
			await win.getByRole('button', { name: 'New design' }).click();
			await expect(win.getByTestId('viewport').locator('canvas')).toBeVisible();
			await expect(win.getByRole('alert')).toHaveCount(0);
			expect(existsSync(dataDir)).toBe(true);
		} finally {
			await app.close();
		}
	});

	test('keeps a design when the app is closed and opened again', async () => {
		const launch = () =>
			electron.launch({
				executablePath,
				args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
				env: { ...process.env, HOLECRAFT_DATA_DIR: dataDir },
			});

		const first = await launch();
		try {
			const win = await first.firstWindow();
			await win.getByRole('button', { name: 'New design' }).click();
			await expect(win.getByTestId('viewport').locator('canvas')).toBeVisible();
			await win.getByRole('textbox', { name: 'Design name' }).fill('Survives restarts');
			await win.getByRole('textbox', { name: 'Design name' }).press('Enter');
			await win.getByRole('button', { name: 'Sphere', exact: true }).click();
			await expect(win.getByTestId('save-status')).toHaveText('Saved', { timeout: 10_000 });
		} finally {
			await first.close();
		}

		const second = await launch();
		try {
			const win = await second.firstWindow();
			await win.getByRole('link', { name: 'Survives restarts', exact: true }).click();
			await expect(win.getByText('Objects: 1')).toBeVisible();
			await expect(win.getByTestId('object-list')).toContainText('Sphere 1');
		} finally {
			await second.close();
		}
	});

	test('exports a design as an STL file from the packaged app', async () => {
		// Normally Electron asks where to save; HOLECRAFT_DOWNLOAD_DIR makes it save straight into a folder.
		const downloads = path.join(dataDir, 'downloads');
		const app = await electron.launch({
			executablePath,
			args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
			env: { ...process.env, HOLECRAFT_DATA_DIR: dataDir, HOLECRAFT_DOWNLOAD_DIR: downloads },
		});
		try {
			const win = await app.firstWindow();
			await win.waitForLoadState('load');
			await win.getByRole('button', { name: 'New design' }).click();
			await expect(win.getByTestId('viewport').locator('canvas')).toBeVisible();
			await win.getByRole('button', { name: 'Box', exact: true }).click();

			await win.getByRole('button', { name: 'Export', exact: true }).click();
			await win.getByRole('menuitem', { name: /as STL/ }).click();

			const saved = path.join(downloads, 'Untitled design.stl');
			await expect.poll(() => existsSync(saved), { timeout: 10_000 }).toBe(true);
			const file = readFileSync(saved);
			expect(file.readUInt32LE(80)).toBe(12); // a cube is 12 triangles
			expect(file.length).toBe(84 + 12 * 50);
		} finally {
			await app.close();
		}
	});

	test('imports a compressed 3MF model and keeps it after a restart', async () => {
		const launch = () =>
			electron.launch({
				executablePath,
				args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
				env: { ...process.env, HOLECRAFT_DATA_DIR: dataDir },
			});

		let app = await launch();
		try {
			const win = await app.firstWindow();
			await win.waitForLoadState('load');
			await win.getByRole('button', { name: 'New design' }).click();
			await expect(win.getByTestId('viewport').locator('canvas')).toBeVisible();
			await win
				.getByTestId('import-file')
				.setInputFiles({ name: 'Part.3mf', mimeType: 'application/octet-stream', buffer: cube3mf(2, 'centimeter') });
			await expect(win.getByTestId('object-list').getByRole('button', { name: /Part/ })).toBeVisible();
			await expect(win.getByTestId('save-status')).toHaveText('Saved');
		} finally {
			await app.close();
		}

		app = await launch();
		try {
			const win = await app.firstWindow();
			await win.waitForLoadState('load');
			await win
				.getByRole('link', { name: /Untitled design/ })
				.first()
				.click();
			await expect(win.getByTestId('object-list').getByRole('button', { name: /Part/ })).toBeVisible();
			await win.getByTestId('object-list').getByRole('button', { name: /Part/ }).click();
			await expect(win.getByRole('region', { name: 'Properties' }).getByLabel('Width', { exact: true })).toHaveValue('20');
		} finally {
			await app.close();
		}
	});

	test('cuts a hole through a solid, so the geometry worker and its WebAssembly work when packaged', async () => {
		const app = await electron.launch({
			executablePath,
			args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
			env: { ...process.env, HOLECRAFT_DATA_DIR: dataDir },
		});
		try {
			const win = await app.firstWindow();
			await win.waitForLoadState('load');
			await win.getByRole('button', { name: 'New design' }).click();
			await expect(win.getByTestId('viewport').locator('canvas')).toBeVisible();

			// A box and a cylinder, both added at the centre; make the cylinder a thin hole that passes through the box.
			await win.getByRole('button', { name: 'Box', exact: true }).click();
			await win.getByRole('button', { name: 'Cylinder', exact: true }).click();
			await win
				.getByTestId('object-list')
				.getByRole('button', { name: /Cylinder 1/ })
				.click();
			const properties = win.getByRole('region', { name: 'Properties' });
			for (const [name, value] of [
				['Width', '10'],
				['Depth', '10'],
				['Height', '40'],
			] as const) {
				await properties.getByLabel(name, { exact: true }).fill(value);
				await properties.getByLabel(name, { exact: true }).press('Enter');
			}
			await properties.getByRole('button', { name: 'Hole', exact: true }).click();
			await win.getByRole('heading', { name: 'Objects' }).click(); // leave the field, so Ctrl+A selects shapes
			await win.keyboard.press('Control+a');
			await win.getByRole('button', { name: 'Group', exact: true }).click();
			await win.keyboard.press('Escape');
			await win.getByLabel('Standard views').selectOption('top');

			// From above the cut shows the pale workplane through the box; the orange top face has little blue in it.
			const box = (await win.getByTestId('viewport').boundingBox())!;
			const cx = box.x + box.width / 2;
			const cy = box.y + box.height / 2;
			await expect.poll(async () => (await pixelAt(win, cx + 3, cy + 3))[2], { timeout: 20_000 }).toBeGreaterThan(150);
			expect((await pixelAt(win, cx + 20, cy))[2]).toBeLessThan(120);
		} finally {
			await app.close();
		}
	});
});
