import { expect, type Locator, type Page } from '@playwright/test';

export const viewport = (page: Page) => page.getByTestId('viewport');

export async function camera(page: Page) {
  const d = await viewport(page).evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return {
    azimuth: Number(d.azimuth),
    polar: Number(d.polar),
    distance: Number(d.distance),
    target: JSON.parse(d.target ?? '[0,0,0]') as number[],
    projection: d.projection,
  };
}

export const properties = (page: Page) => page.getByRole('region', { name: 'Properties' });
export const field = (page: Page, name: string) => properties(page).getByLabel(name, { exact: true });

export async function selectView(page: Page, view: string) {
  await page.getByLabel('Standard views').selectOption(view);
}

export async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

const objectRows = (page: Page) => page.getByTestId('object-list').locator('li');

/** Parses "Box 1 (12, -3)" rows from the object list. */
export async function objects(page: Page) {
  const rows = await objectRows(page).allInnerTexts();
  return rows.map((text) => {
    const m = /^(.+?)\s+\((-?[\d.]+), (-?[\d.]+)\)/.exec(text.trim());
    if (!m) throw new Error(`unparseable row: ${text}`);
    return { name: m[1]!, x: Number(m[2]), y: Number(m[3]) };
  });
}

/** Names of the shapes currently selected, in list order. */
export async function selectedNames(page: Page): Promise<string[]> {
  const rows = objectRows(page);
  const out: string[] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    if ((await row.getAttribute('data-selected')) === 'true') out.push((await row.innerText()).replace(/\s*\(.*$/s, ''));
  }
  return out;
}

/** Adds a shape by dragging it `dx`, `dy` pixels from the centre of the view. */
export async function dropShape(page: Page, shape: 'Box' | 'Cylinder' | 'Sphere', dx = 0, dy = 0) {
  const { box } = await center(viewport(page));
  await page
    .getByRole('button', { name: shape, exact: true })
    .dragTo(viewport(page), { targetPosition: { x: box.width / 2 + dx, y: box.height / 2 + dy } });
}

type Pt = { x: number; y: number };

/** Press, move in steps and release with the given mouse button. */
export async function drag(
  page: Page,
  from: Pt,
  to: Pt,
  opts: { button?: 'left' | 'right' | 'middle'; shift?: boolean; steps?: number } = {},
) {
  const { button = 'left', shift = false, steps = 8 } = opts;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up({ button });
  if (shift) await page.keyboard.up('Shift');
}

/** Waits until the camera has stopped easing (two identical readings in a row). */
export async function cameraSettled(page: Page) {
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await camera(page));
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}
