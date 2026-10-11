import { expect, test, type Locator, type Page } from '@playwright/test';

const viewport = (page: Page) => page.getByTestId('viewport');

async function camera(page: Page) {
  const d = await viewport(page).evaluate((el) => ({ ...(el as HTMLElement).dataset }));
  return {
    azimuth: Number(d.azimuth),
    polar: Number(d.polar),
    distance: Number(d.distance),
    target: JSON.parse(d.target ?? '[0,0,0]') as number[],
    projection: d.projection,
  };
}

async function selectView(page: Page, view: string) {
  await page.getByLabel('Standard views').selectOption(view);
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/** Parses "Box 1 (12, -3)" rows from the object list. */
async function objects(page: Page) {
  const rows = await page.getByTestId('object-list').getByRole('listitem').allInnerTexts();
  return rows.map((text) => {
    const m = /^(.+?)\s+\((-?[\d.]+), (-?[\d.]+)\)/.exec(text.trim());
    if (!m) throw new Error(`unparseable row: ${text}`);
    return { name: m[1]!, x: Number(m[2]), y: Number(m[3]) };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(viewport(page).locator('canvas')).toBeVisible();
});

test.describe('app icon', () => {
  test('the page icon is served', async ({ page, request }) => {
    const href = await page.locator('link[rel=icon]').getAttribute('href');
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  });
});

test.describe('shapes panel', () => {
  test('lists the basic shapes', async ({ page }) => {
    for (const name of ['Box', 'Cylinder', 'Sphere']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });

  test('starts with an empty design', async ({ page }) => {
    await expect(page.getByText('Objects: 0')).toBeVisible();
  });

  test('clicking a shape adds it at the centre of the workplane', async ({ page }) => {
    await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
    await expect(page.getByText('Objects: 1')).toBeVisible();
    expect(await objects(page)).toEqual([{ name: 'Cylinder 1', x: 0, y: 0 }]);
  });

  test('pressing Enter on a focused shape adds it', async ({ page }) => {
    await page.getByRole('button', { name: 'Sphere', exact: true }).focus();
    await page.keyboard.press('Enter');
    expect(await objects(page)).toEqual([{ name: 'Sphere 1', x: 0, y: 0 }]);
  });
});

test.describe('dragging shapes onto the workplane', () => {
  test('dropping in the middle of the view places the shape at the origin', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).dragTo(viewport(page));
    expect(await objects(page)).toEqual([{ name: 'Box 1', x: 0, y: 0 }]);
  });

  test('the drop position follows the pointer and snaps to the grid', async ({ page }) => {
    const { box } = await center(viewport(page));
    await page
      .getByRole('button', { name: 'Box', exact: true })
      .dragTo(viewport(page), { targetPosition: { x: box.width / 2 + 150, y: box.height / 2 } });
    const [dropped] = await objects(page);
    expect(dropped!.x).toBeGreaterThan(20);
    expect(Number.isInteger(dropped!.x)).toBe(true);
    expect(Number.isInteger(dropped!.y)).toBe(true);
  });

  test('dropping above the horizon (no workplane under the pointer) adds nothing', async ({ page }) => {
    await page.keyboard.press('Home');
    // Look level so the top of the view is sky, not workplane.
    await page.getByRole('button', { name: 'Front view' }).click();
    await page.getByRole('button', { name: 'Box', exact: true }).dragTo(viewport(page), { targetPosition: { x: 200, y: 5 } });
    await expect(page.getByText('Objects: 0')).toBeVisible();
  });
});

test.describe('camera controls', () => {
  test('right-drag orbits', async ({ page }) => {
    const before = await camera(page);
    const { x, y } = await center(viewport(page));
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x + 120, y + 40, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    const after = await camera(page);
    expect(after.azimuth).not.toBeCloseTo(before.azimuth, 2);
    expect(after.polar).not.toBeCloseTo(before.polar, 2);
    expect(after.distance).toBeCloseTo(before.distance, 6);
  });

  test('the mouse wheel zooms', async ({ page }) => {
    const before = await camera(page);
    const { x, y } = await center(viewport(page));
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => (await camera(page)).distance).toBeLessThan(before.distance);
    await page.mouse.wheel(0, 900);
    await expect.poll(async () => (await camera(page)).distance).toBeGreaterThan(before.distance);
  });

  test('middle-drag pans without changing the view direction', async ({ page }) => {
    const before = await camera(page);
    const { x, y } = await center(viewport(page));
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x + 100, y, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    const after = await camera(page);
    expect(after.target).not.toEqual(before.target);
    expect(after.azimuth).toBeCloseTo(before.azimuth, 6);
    expect(after.polar).toBeCloseTo(before.polar, 6);
  });

  test('the right-click menu is suppressed over the view', async ({ page }) => {
    const prevented = await viewport(page).evaluate((el) => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.querySelector('canvas')!.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
  });

  test('Home returns to the default view', async ({ page }) => {
    const home = await camera(page);
    await page.getByRole('button', { name: 'Top view' }).click();
    await page.getByRole('button', { name: 'Home view' }).click();
    await expect.poll(async () => (await camera(page)).polar).toBeCloseTo(home.polar, 6);
    expect((await camera(page)).azimuth).toBeCloseTo(home.azimuth, 6);
  });

  test('the Home key does the same', async ({ page }) => {
    const home = await camera(page);
    await selectView(page, 'right');
    await page.keyboard.press('Home');
    await expect.poll(async () => (await camera(page)).azimuth).toBeCloseTo(home.azimuth, 6);
  });

  test('Fit all frames the objects', async ({ page }) => {
    await page.getByRole('button', { name: 'Box', exact: true }).dragTo(viewport(page), { targetPosition: { x: 60, y: 300 } });
    await page.getByRole('button', { name: 'Fit all' }).click();
    const [obj] = await objects(page);
    // The camera eases to the fitted view, so wait for it to arrive before checking where.
    await expect
      .poll(async () => {
        const c = await camera(page);
        return c.distance < 100 && Math.abs(c.target[0]! - obj!.x) < 0.01 && Math.abs(c.target[1]! - obj!.y) < 0.01;
      })
      .toBe(true);
  });

  test('F fits and works from the keyboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Sphere', exact: true }).click();
    await page.keyboard.press('f');
    await expect.poll(async () => (await camera(page)).distance).toBeLessThan(330);
  });

  test('toggles between perspective and orthographic', async ({ page }) => {
    expect((await camera(page)).projection).toBe('perspective');
    const toggle = page.getByRole('button', { name: 'Orthographic' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect((await camera(page)).projection).toBe('orthographic');
    await toggle.click();
    expect((await camera(page)).projection).toBe('perspective');
  });
});

test.describe('view cube', () => {
  // At the default view the camera sees the front, left and top faces, so only those can be
  // clicked on the cube itself. The other sides are reached through the Standard views menu.
  const cube: Array<[string, (c: Awaited<ReturnType<typeof camera>>) => void]> = [
    ['Top view', (c) => expect(c.polar).toBeLessThan(0.01)],
    ['Front view', (c) => (expect(c.azimuth).toBeCloseTo(0, 6), expect(c.polar).toBeCloseTo(Math.PI / 2, 6))],
    ['Left view', (c) => expect(c.azimuth).toBeCloseTo(-Math.PI / 2, 6)],
  ];

  for (const [name, check] of cube) {
    test(`clicking the "${name}" face looks from that side`, async ({ page }) => {
      await page.getByRole('button', { name }).click();
      await expect.poll(async () => settled(page, check)).toBe(true);
    });
  }

  const menu: Array<[string, string, (c: Awaited<ReturnType<typeof camera>>) => void]> = [
    ['top', 'Top', (c) => expect(c.polar).toBeLessThan(0.01)],
    ['bottom', 'Bottom', (c) => expect(c.polar).toBeGreaterThan(Math.PI - 0.01)],
    ['front', 'Front', (c) => expect(c.azimuth).toBeCloseTo(0, 6)],
    ['back', 'Back', (c) => expect(c.azimuth).toBeCloseTo(Math.PI, 6)],
    ['left', 'Left', (c) => expect(c.azimuth).toBeCloseTo(-Math.PI / 2, 6)],
    ['right', 'Right', (c) => expect(c.azimuth).toBeCloseTo(Math.PI / 2, 6)],
    ['iso', 'Isometric', (c) => expect(c.polar).toBeCloseTo(Math.acos(1 / Math.sqrt(3)), 6)],
  ];

  for (const [value, label, check] of menu) {
    test(`the Standard views menu offers ${label}`, async ({ page }) => {
      await selectView(page, value);
      await expect.poll(async () => settled(page, check)).toBe(true);
    });
  }

  test('the cube turns with the camera', async ({ page }) => {
    const body = page.getByTestId('view-cube-body');
    const before = await body.evaluate((el) => (el as HTMLElement).style.transform);
    await selectView(page, 'top');
    await expect.poll(() => body.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);
  });

  test('is hidden when WebGL is unavailable, since there is no view to control', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('view-cube-body')).toHaveCount(0);
  });
});

/** True once the camera satisfies `check` (assertion errors count as "not yet"). */
async function settled(page: Page, check: (c: Awaited<ReturnType<typeof camera>>) => void) {
  try {
    check(await camera(page));
    return true;
  } catch {
    return false;
  }
}
