import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dropShape, field, newDesign, properties } from './helpers.ts';
import { parseObj, parseStl, read3mf } from './meshFiles.ts';

const exportButton = (page: Page) => page.getByRole('button', { name: 'Export', exact: true });
const list = (page: Page) => page.getByTestId('object-list');
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Design name' });

/** Opens the Export menu, picks a format and returns the downloaded file. */
async function exportAs(page: Page, format: 'STL' | 'OBJ' | '3MF') {
  await exportButton(page).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('menuitem', { name: new RegExp(`as ${format}`) }).click(),
  ]);
  const path = await download.path();
  return { fileName: download.suggestedFilename(), file: await readFile(path) };
}

async function setFields(page: Page, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    await field(page, name).fill(value);
    await field(page, name).press('Enter');
    await expect(field(page, name)).toHaveValue(value);
  }
  await page.getByRole('heading', { name: 'Objects' }).click(); // leave the field so shortcuts work
}

const select = (page: Page, name: RegExp) => list(page).getByRole('button', { name }).click();

/** A 20 mm box at the origin with a 10 x 10 x 40 hole through it, grouped. */
async function drilledBox(page: Page) {
  await page.getByRole('button', { name: 'Box', exact: true }).click();
  await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
  await select(page, /Cylinder 1/);
  await setFields(page, { Width: '10', Depth: '10', Height: '40' });
  await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Group', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await newDesign(page);
});

test.describe('the Export menu', () => {
  test('is disabled until there is something to print', async ({ page }) => {
    await expect(exportButton(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await expect(exportButton(page)).toBeEnabled();
  });

  test('stays disabled when everything is a hole', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await select(page, /Box 1/);
    await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
    await expect(exportButton(page)).toBeDisabled();
  });

  test('offers STL, OBJ and 3MF', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await exportButton(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    for (const format of ['STL', 'OBJ', '3MF']) await expect(page.getByRole('menuitem', { name: new RegExp(`as ${format}`) })).toBeVisible();
  });

  test('closes on Escape and when you click elsewhere', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await exportButton(page).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    await exportButton(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('heading', { name: 'Shapes' }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('tells the menu state to assistive technology', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await expect(exportButton(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(exportButton(page)).toHaveAttribute('aria-expanded', 'false');
    await exportButton(page).click();
    await expect(exportButton(page)).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('STL export', () => {
  test('downloads a 20 mm cube as a proper binary STL', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const { fileName, file } = await exportAs(page, 'STL');

    expect(fileName).toBe('Untitled design.stl');
    const stl = parseStl(file);
    expect(stl.headerText.startsWith('solid')).toBe(false);
    expect(stl.triangles).toBe(12);
    expect(stl.min).toEqual([-10, -10, 0]);
    expect(stl.max).toEqual([10, 10, 20]);
    expect(stl.volume).toBeCloseTo(8000, 3);
  });

  test('is named after the design, made safe for file systems', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await nameBox(page).fill('Bracket: v2/final');
    await nameBox(page).press('Enter');
    const { fileName } = await exportAs(page, 'STL');
    expect(fileName).toBe('Bracket- v2-final.stl');
  });

  test('has the hole cut out of a drilled box', async ({ page }) => {
    await drilledBox(page);
    const { file } = await exportAs(page, 'STL');
    const stl = parseStl(file);
    const bore = 0.5 * 64 * 25 * Math.sin((2 * Math.PI) / 64) * 20;
    expect(Math.abs(stl.volume - (8000 - bore))).toBeLessThan(80);
    expect(stl.triangles).toBeGreaterThan(12);
    expect(stl.min).toEqual([-10, -10, 0]);
    expect(stl.max).toEqual([10, 10, 20]);
  });

  test('does not include holes that are not in a group with something', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
    await select(page, /Cylinder 1/);
    await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
    const stl = parseStl((await exportAs(page, 'STL')).file);
    expect(stl.triangles).toBe(12);
    expect(stl.max[2]).toBe(20);
  });

  test('puts each shape where it is: moved, lifted and turned', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await select(page, /Box 1/);
    await setFields(page, { Width: '40', Depth: '10', Height: '10' });
    await select(page, /Box 1/);
    await setFields(page, { X: '30', Y: '-10', Z: '5', 'Rotate Z': '90' });

    const stl = parseStl((await exportAs(page, 'STL')).file);
    // 40 x 10 turned a quarter turn is 10 wide and 40 long, centred on (30, -10), 5 mm up.
    expect(stl.min[0]).toBeCloseTo(25, 3);
    expect(stl.max[0]).toBeCloseTo(35, 3);
    expect(stl.min[1]).toBeCloseTo(-30, 3);
    expect(stl.max[1]).toBeCloseTo(10, 3);
    expect(stl.min[2]).toBeCloseTo(5, 3);
    expect(stl.max[2]).toBeCloseTo(15, 3);
  });

  test('includes every shape, whatever is selected', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await dropShape(page, 'Box', 200, 0);
    await select(page, /Box 1/); // only one selected
    const stl = parseStl((await exportAs(page, 'STL')).file);
    expect(stl.triangles).toBe(24);
    expect(stl.volume).toBeCloseTo(16000, 2);
  });

  test('says so when the holes cut away everything', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await select(page, /Box 2/);
    await setFields(page, { Width: '100', Depth: '100', Height: '100' });
    await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
    await page.keyboard.press('Control+a');
    await page.getByRole('button', { name: 'Group', exact: true }).click();

    await exportButton(page).click();
    await page.getByRole('menuitem', { name: /as STL/ }).click();
    await expect(page.getByRole('alert')).toContainText(/nothing to export/i);
  });

  test('can be exported more than once', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await exportAs(page, 'STL');
    const second = await exportAs(page, 'STL');
    expect(parseStl(second.file).triangles).toBe(12);
  });
});

test.describe('exporting only the selection', () => {
  const onlySelected = (page: Page) => page.getByRole('checkbox', { name: /only the selected/i });

  async function boxAndSphere(page: Page) {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await dropShape(page, 'Sphere', 200, 0);
  }

  test('offers the choice only while something is selected', async ({ page }) => {
    await boxAndSphere(page);
    await page.keyboard.press('Escape'); // clear the selection
    await exportButton(page).click();
    await expect(onlySelected(page)).toHaveCount(0);
    await page.keyboard.press('Escape');

    await select(page, /Box 1/);
    await exportButton(page).click();
    await expect(onlySelected(page)).toBeVisible();
    await expect(onlySelected(page)).not.toBeChecked();
  });

  test('exports everything unless you tick it', async ({ page }) => {
    await boxAndSphere(page);
    await select(page, /Box 1/);
    const stl = parseStl((await exportAs(page, 'STL')).file);
    expect(stl.max[0]).toBeGreaterThan(30); // the sphere is in there too
  });

  test('exports just the selected shapes when ticked', async ({ page }) => {
    await boxAndSphere(page);
    await select(page, /Box 1/);
    await exportButton(page).click();
    await onlySelected(page).check();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('menuitem', { name: /as STL/ }).click(),
    ]);
    const stl = parseStl(await readFile(await download.path()));
    expect(stl.triangles).toBe(12);
    expect(stl.volume).toBeCloseTo(8000, 3);
  });

  test('says so when the selection has nothing solid to print', async ({ page }) => {
    await boxAndSphere(page);
    await select(page, /Sphere 1/);
    await properties(page).getByRole('button', { name: 'Hole', exact: true }).click();
    await exportButton(page).click();
    await onlySelected(page).check();
    await page.getByRole('menuitem', { name: /as STL/ }).click();
    await expect(page.getByRole('alert')).toContainText(/nothing to export/i);
  });
});

test.describe('OBJ export', () => {
  test('writes a text OBJ in millimetres with the shape\'s name', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const { fileName, file } = await exportAs(page, 'OBJ');
    expect(fileName).toBe('Untitled design.obj');
    const obj = parseObj(file.toString('utf8'));
    expect(obj.comments.join(' ')).toMatch(/units: mm/);
    expect(obj.objects).toEqual(['Box 1']);
    expect(obj.vertices).toBe(8);
    expect(obj.faces).toBe(12);
    expect(obj.maxFaceIndex).toBeLessThanOrEqual(obj.vertices);
  });

  test('numbers faces correctly across several shapes', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await dropShape(page, 'Sphere', 200, 0);
    const obj = parseObj((await exportAs(page, 'OBJ')).file.toString('utf8'));
    expect(obj.objects).toEqual(['Box 1', 'Sphere 1']);
    expect(obj.maxFaceIndex).toBe(obj.vertices); // the last face uses the very last vertex, and none beyond
  });
});

test.describe('3MF export', () => {
  test('writes a valid package in millimetres', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const { fileName, file } = await exportAs(page, '3MF');
    expect(fileName).toBe('Untitled design.3mf');

    const parts = read3mf(file);
    expect(Object.keys(parts).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
    const model = parts['3D/3dmodel.model']!;
    expect(model).toContain('unit="millimeter"');
    expect(model.match(/<vertex /g)).toHaveLength(8);
    expect(model.match(/<triangle /g)).toHaveLength(12);
    expect(model).toContain('name="Box 1"');
  });

  test('keeps the shape\'s colour', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await select(page, /Box 1/);
    await field(page, 'Color').fill('#336699');
    const model = read3mf((await exportAs(page, '3MF')).file)['3D/3dmodel.model']!;
    expect(model).toContain('displaycolor="#336699FF"');
  });

  test('lists a group as one object and each loose shape as its own', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await dropShape(page, 'Sphere', 200, 0);
    await dropShape(page, 'Cylinder', -200, 0);
    await select(page, /Box 1/);
    await list(page).getByRole('button', { name: /Sphere 1/ }).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Group', exact: true }).click();

    const model = read3mf((await exportAs(page, '3MF')).file)['3D/3dmodel.model']!;
    expect(model.match(/<object /g)).toHaveLength(2); // the group, and the cylinder
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(model).toContain('name="Group 1"');
  });
});
