import { expect, test } from '@playwright/test';

test.describe('web app shell', () => {
  test('loads the editor and connects to the server', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto('/');

    await expect(page).toHaveTitle('Holecraft');
    await expect(page.getByRole('status')).toHaveText(/Server v\d+\.\d+\.\d+/);
    await expect(page.getByText('Workplane 200 × 200 mm')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('creates a live WebGL viewport that fills its container', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByTestId('viewport').locator('canvas');
    await expect(canvas).toBeVisible();

    const info = await canvas.evaluate((el: HTMLCanvasElement) => {
      const gl = el.getContext('webgl2');
      return { hasGl: !!gl && !gl.isContextLost(), w: el.width, h: el.height };
    });
    expect(info.hasGl).toBe(true);
    expect(info.w).toBeGreaterThan(300);
    expect(info.h).toBeGreaterThan(300);
  });

  test('serves a working app shell for nested client-side routes', async ({ page }) => {
    await page.goto('/designs/some-id');
    await expect(page.getByRole('status')).toHaveText(/Server v/);
    await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
  });

  test('keeps the UI usable and explains when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...args);
      } as typeof original;
    });

    await page.goto('/');

    await expect(page.getByRole('status')).toHaveText(/Server v/);
    await expect(page.getByRole('alert')).toContainText('3D view could not start');
  });
});
