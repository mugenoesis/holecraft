import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { dropShape, field, newDesign, selectedNames, uniqueName } from './helpers.ts';

const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Design name' });
const designId = (page: Page) => new URL(page.url()).pathname.split('/').pop()!;

interface Summary {
  id: string;
  thumbnailAt?: number;
}
const summaryOf = async (request: APIRequestContext, id: string) => ((await (await request.get('/api/designs')).json()) as Summary[]).find((d) => d.id === id)!;

/** Reads the picture the server holds for a design, as pixels. */
async function pictureOf(page: Page, id: string) {
  return page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let orange = 0;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
      if (r > 180 && g > 90 && g < 170 && b < 90) orange++;
      if (b > 150 && r < 80 && g < 80) blue++;
    }
    return { width: canvas.width, height: canvas.height, corner: [data[0]!, data[1]!, data[2]!], orange, blue };
  }, `/api/designs/${id}/thumbnail?cache=${Date.now()}`);
}

test.describe('thumbnails on the designs list', () => {
  test('a design with shapes gets a picture of them, shown on its card', async ({ page, request }) => {
    const name = uniqueName('Pictured');
    await newDesign(page);
    await nameBox(page).fill(name);
    await nameBox(page).press('Enter');
    const id = designId(page);
    await page.getByRole('button', { name: 'Box', exact: true }).click();

    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt, { timeout: 20_000 }).toBeDefined();
    await page.getByRole('link', { name: 'All designs' }).click();
    const card = page.getByTestId('design-card').filter({ hasText: name });
    const image = card.locator('img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test('the picture shows the design itself: its colour, on a plain background with no grid', async ({ page, request }) => {
    await newDesign(page);
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const id = designId(page);
    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt, { timeout: 20_000 }).toBeDefined();

    const picture = await pictureOf(page, id);
    expect(picture.width).toBeLessThanOrEqual(512);
    expect(picture.height).toBeLessThanOrEqual(512);
    expect(picture.orange).toBeGreaterThan(300); // the orange box fills a good part of the picture
    expect(picture.corner).toEqual([231, 236, 240]); // the plain scene background: no workplane grid
  });

  test('a selected shape is not drawn with its selection tint', async ({ page, request }) => {
    await newDesign(page);
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
    await expect.poll(() => selectedNames(page)).toEqual(['Box 1']);
    const id = designId(page);
    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt, { timeout: 20_000 }).toBeDefined();
    expect((await pictureOf(page, id)).orange).toBeGreaterThan(300);
  });

  test('the picture follows the design when it changes', async ({ page, request }) => {
    await newDesign(page);
    await page.getByRole('button', { name: 'Box', exact: true }).click();
    const id = designId(page);
    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt, { timeout: 20_000 }).toBeDefined();
    const first = (await summaryOf(request, id)).thumbnailAt!;

    await page.getByTestId('object-list').getByRole('button', { name: /Box 1/ }).click();
    await field(page, 'Color').fill('#0000ff');
    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt!, { timeout: 20_000 }).toBeGreaterThan(first);
    await expect.poll(async () => (await pictureOf(page, id)).blue, { timeout: 20_000 }).toBeGreaterThan(300);
  });

  test('a design with nothing in it has no picture, and its card shows a placeholder', async ({ page, request }) => {
    const name = uniqueName('Empty');
    await newDesign(page);
    await nameBox(page).fill(name);
    await nameBox(page).press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await page.waitForTimeout(3500); // longer than the pause before a picture is taken
    expect((await summaryOf(request, designId(page))).thumbnailAt).toBeUndefined();

    await page.getByRole('link', { name: 'All designs' }).click();
    const card = page.getByTestId('design-card').filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
    await expect(card.locator('.design-thumb')).toBeVisible();
  });

  test('a duplicate starts with the same picture', async ({ page, request }) => {
    const name = uniqueName('Original');
    await newDesign(page);
    await nameBox(page).fill(name);
    await nameBox(page).press('Enter');
    await dropShape(page, 'Sphere');
    const id = designId(page);
    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt, { timeout: 20_000 }).toBeDefined();

    await page.getByRole('link', { name: 'All designs' }).click();
    const card = page.getByTestId('design-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'Duplicate' }).click();
    const copy = page.getByTestId('design-card').filter({ hasText: `Copy of ${name}` });
    await expect(copy.locator('img')).toBeVisible();
  });

  test('clicking the picture opens the design', async ({ page, request }) => {
    const name = uniqueName('Clickable');
    await newDesign(page);
    await nameBox(page).fill(name);
    await nameBox(page).press('Enter');
    await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
    const id = designId(page);
    await expect.poll(async () => (await summaryOf(request, id)).thumbnailAt, { timeout: 20_000 }).toBeDefined();
    await page.getByRole('link', { name: 'All designs' }).click();
    await page.getByTestId('design-card').filter({ hasText: name }).locator('.design-thumb').click();
    await expect(page).toHaveURL(new RegExp(`/design/${id}$`));
  });
});
