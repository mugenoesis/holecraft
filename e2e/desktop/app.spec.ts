import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

// Tests the packaged app (apps/desktop/release/linux-unpacked), not the dev build,
// so packaging mistakes such as missing resources are caught.
const executablePath = path.resolve(import.meta.dirname, '../../apps/desktop/release/linux-unpacked/ezcad');

test.describe('desktop app', () => {
  test.skip(!existsSync(executablePath), 'Package the desktop app first (scripts/package-desktop.sh)');

  let dataDir: string;
  test.beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'ezcad-desktop-'));
  });
  test.afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('opens a window running the editor against its embedded server', async () => {
    const app = await electron.launch({
      executablePath,
      // CI containers have no GPU; use Chromium's software WebGL.
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      env: { ...process.env, EZCAD_DATA_DIR: dataDir },
    });
    try {
      const win = await app.firstWindow();
      await win.waitForLoadState('load');
      expect(win.url()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

      await expect(win.getByRole('status')).toHaveText(/Server v\d+\.\d+\.\d+/);
      await expect(win.getByTestId('viewport').locator('canvas')).toBeVisible();
      await expect(win.getByRole('alert')).toHaveCount(0);
      expect(existsSync(dataDir)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
