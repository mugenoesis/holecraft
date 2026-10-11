// Screenshots a page with software WebGL and prints any console errors.
// Usage: node scripts/lib/screenshot.mjs <url> <out.png> [width] [height]
import { chromium } from '@playwright/test';

const [url, output, width = '1280', height = '800'] = process.argv.slice(2);
if (!url || !output) {
  console.error('Usage: screenshot.mjs <url> <out.png> [width] [height]');
  process.exit(1);
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: output });
await browser.close();

if (errors.length) {
  console.error(`Console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
