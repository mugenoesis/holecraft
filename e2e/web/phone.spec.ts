import { expect, test, type Page } from '@playwright/test';
import { newDesign, viewport } from './helpers.ts';
import { cubeStl } from './modelFiles.ts';

/*
 * The editor on a phone: 412 x 915 with touch, like a typical Android phone in portrait. These tests
 * measure where things really are, so the layout can't quietly break again.
 */

const PHONE = { width: 412, height: 915 };

test.describe('on a phone', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await newDesign(page);
  });

  const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;

  test('the page does not scroll sideways', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('every button in the top bar can be reached on screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const buttons = page.locator('.topbar button:visible, .topbar a:visible');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(7); // back, undo, redo, group, ungroup, import, export
    for (let i = 0; i < count; i++) {
      const b = await box(buttons.nth(i));
      expect(b.x, `button ${i} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `button ${i} ends on screen`).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test('the save status and design name are visible', async ({ page }) => {
    for (const locator of [page.getByTestId('save-status'), page.getByRole('textbox', { name: 'Design name' })]) {
      const b = await box(locator);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width);
    }
  });

  test('the 3D view gets most of the screen and the panels sit below it', async ({ page }) => {
    const view = await box(viewport(page));
    const panel = await box(page.locator('.panel'));
    expect(view.width).toBeGreaterThanOrEqual(PHONE.width - 1);
    expect(view.height).toBeGreaterThanOrEqual(PHONE.height * 0.45);
    expect(panel.y).toBeGreaterThanOrEqual(view.y + view.height - 1);
    expect(panel.height).toBeLessThanOrEqual(PHONE.height * 0.4);
    expect(panel.y + panel.height).toBeLessThanOrEqual(PHONE.height);
  });

  test('the shapes can be picked from a row you swipe through, not a tall stack', async ({ page }) => {
    const tiles = page.locator('.shape-tile');
    const ys = await tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1); // all on one line
  });

  test('the Export menu opens inside the screen', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const menu = await box(page.getByRole('menu'));
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('an error message stays on screen', async ({ page }) => {
    await page.getByTestId('import-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    const alert = await box(page.getByRole('alert'));
    expect(alert.x).toBeGreaterThanOrEqual(0);
    expect(alert.x + alert.width).toBeLessThanOrEqual(PHONE.width);
  });

  test('buttons and fields are big enough for a finger', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
    for (const name of ['Undo', 'Import', 'Export']) {
      const b = await box(page.getByRole('button', { name, exact: true }));
      expect(b.height, `${name} is tall enough`).toBeGreaterThanOrEqual(40);
    }
    const width = await box(page.getByRole('region', { name: 'Properties' }).getByLabel('Width', { exact: true }));
    expect(width.height).toBeGreaterThanOrEqual(40);
  });

  test('the resize and rotate handles are big enough to grab', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
    const handles = page.locator('.handle, .rotate-handle');
    await expect.poll(() => handles.count()).toBeGreaterThan(3);
    const sizes = await handles.evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)));
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(24);
  });

  test('importing a file still works from the phone layout', async ({ page }) => {
    await page.getByTestId('import-file').setInputFiles({ name: 'Cube.stl', mimeType: 'application/octet-stream', buffer: cubeStl(20) });
    await expect(page.getByTestId('object-list').getByRole('button', { name: /Cube/ })).toBeVisible();
  });
});

test.describe('on a desktop screen', () => {
  test('the Import and Export buttons look like the other buttons', async ({ page }) => {
    await newDesign(page);
    const style = (name: string) =>
      page.getByRole('button', { name, exact: true }).evaluate((el) => {
        const s = getComputedStyle(el);
        return { radius: s.borderRadius, padding: s.padding, border: s.borderTopWidth, font: s.fontSize, bg: s.backgroundColor };
      });
    const undo = await style('Undo');
    expect(await style('Import')).toEqual(undo);
    expect(await style('Export')).toEqual(undo);
  });
});
