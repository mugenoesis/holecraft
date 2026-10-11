// Renders an SVG file to a transparent square PNG with headless Chromium.
// Usage: node scripts/lib/render-svg.mjs <in.svg> <out.png> [size]
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [input, output, sizeArg = '512'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: render-svg.mjs <in.svg> <out.png> [size]');
  process.exit(1);
}
const size = Number(sizeArg);
const svg = await readFile(input, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: size, height: size } });
await page.setContent(
  `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
);
await page.screenshot({ path: output, omitBackground: true });
await browser.close();
