import { expect, test } from '@playwright/test';
import { createDesignViaApi, newDesign, viewport } from './helpers.ts';

test.describe('web app shell', () => {
  test('loads the designs list and connects to the server', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto('/');

    await expect(page).toHaveTitle('Holecraft');
    await expect(page.getByRole('status')).toHaveText(/Server v\d+\.\d+\.\d+/);
    await expect(page.getByRole('button', { name: 'New design' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('opens the editor without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await newDesign(page);

    await expect(page.getByText('Workplane 200 × 200 mm')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(/Server v\d+\.\d+\.\d+/);
    expect(errors).toEqual([]);
  });

  test('creates a live WebGL viewport that fills its container', async ({ page }) => {
    await newDesign(page);
    const canvas = viewport(page).locator('canvas');

    const info = await canvas.evaluate((el: HTMLCanvasElement) => {
      const gl = el.getContext('webgl2');
      return { hasGl: !!gl && !gl.isContextLost(), w: el.width, h: el.height };
    });
    expect(info.hasGl).toBe(true);
    expect(info.w).toBeGreaterThan(300);
    expect(info.h).toBeGreaterThan(300);
  });

  test('opens a design straight from its address', async ({ page, request }) => {
    const { id } = await createDesignViaApi(request);
    await page.goto(`/design/${id}`);
    await expect(viewport(page).locator('canvas')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(/Server v/);
  });

  test('says so when a design does not exist, and offers a way back', async ({ page }) => {
    await page.goto('/design/0123456789abcdef0123456789abcdef');
    await expect(page.getByRole('heading', { name: 'Design not found' })).toBeVisible();
    await page.getByRole('link', { name: 'All designs' }).click();
    await expect(page.getByRole('button', { name: 'New design' })).toBeVisible();
  });

  test('says so for an address that is not a page', async ({ page }) => {
    await page.goto('/nowhere/at/all');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
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
    await page.getByRole('button', { name: 'New design' }).click();

    await expect(page.getByRole('status')).toHaveText(/Server v/);
    await expect(page.getByRole('alert')).toContainText('3D view could not start');
  });
});
