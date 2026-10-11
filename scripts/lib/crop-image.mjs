// Crops a region from an image and scales it to a square PNG, using headless Chromium.
// Usage: node scripts/lib/crop-image.mjs <in> <out.png> <x> <y> <w> <h> <size>
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [input, output, x, y, w, h, size] = process.argv.slice(2);
if (!input || !output || [x, y, w, h, size].some((v) => v === undefined || Number.isNaN(Number(v)))) {
  console.error('Usage: crop-image.mjs <in> <out.png> <x> <y> <w> <h> <size>');
  process.exit(1);
}

const bytes = await readFile(input);
const mime = input.endsWith('.png') ? 'image/png' : 'image/jpeg';
const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(
  async ({ dataUrl, x, y, w, h, size }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, size, size);
    return canvas.toDataURL('image/png').split(',')[1];
  },
  { dataUrl, x: Number(x), y: Number(y), w: Number(w), h: Number(h), size: Number(size) },
);
await browser.close();
await writeFile(output, Buffer.from(png, 'base64'));
