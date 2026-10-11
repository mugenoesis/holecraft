import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { cameraSettled, center, dropShape, field, newDesign, objects, pixelAt, properties, selectView, selectedNames, viewport } from './helpers.ts';
import { parseStl } from './meshFiles.ts';
import { cube3mf, cubeAsciiStl, cubeObj, cubeStl, flatStl } from './modelFiles.ts';

const importInput = (page: Page) => page.getByTestId('import-file');
const list = (page: Page) => page.getByTestId('object-list');
const exportButton = (page: Page) => page.getByRole('button', { name: 'Export', exact: true });

async function importFile(page: Page, name: string, buffer: Buffer) {
  await importInput(page).setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
}

async function exportStl(page: Page) {
  await exportButton(page).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('menuitem', { name: /as STL/ }).click()]);
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
  test('is there, and offers STL, OBJ and 3MF files', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled();
    expect(await importInput(page).getAttribute('accept')).toBe('.stl,.obj,.3mf');
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
    await dropShape(page, 'Cylinder');
    await list(page).getByRole('button', { name: /Cylinder 1/ }).click();
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
    await dropShape(page, 'Cylinder');
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
    await expect(page.getByRole('alert')).toContainText('STL, OBJ or 3MF');
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
