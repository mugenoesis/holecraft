// Screenshots a page with software WebGL and prints any console errors.
// Usage: node scripts/lib/screenshot.mjs <url> <out.png> [width] [height]
// Env:   DEMO=1        drop a few shapes on the workplane first
//        VIEW=<name>   pick a standard view first (front, back, left, right, top, bottom, iso)
//        CLICK=dx,dy   click this many pixels from the viewport centre (selects what is there)
//        PRESS=a,b     press these keys (Playwright names, comma-separated) after DEMO, e.g. Control+a
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

if (process.env.DEMO === '1') {
  const viewport = page.getByTestId('viewport');
  const box = await viewport.boundingBox();
  const drops = [
    ['Box', -90, 30],
    ['Cylinder', 0, 0],
    ['Sphere', 90, -30],
    ['Box', 30, 90],
  ];
  for (const [name, dx, dy] of drops) {
    await page.getByRole('button', { name, exact: true }).dragTo(viewport, {
      targetPosition: { x: box.width / 2 + dx * 2, y: box.height / 2 + dy * 2 },
    });
  }
}
if (process.env.CLICK) {
  const [dx, dy] = process.env.CLICK.split(',').map(Number);
  const box = await page.getByTestId('viewport').boundingBox();
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}
for (const key of (process.env.PRESS ?? '').split(',').filter(Boolean)) {
  await page.keyboard.press(key);
}
if (process.env.VIEW) {
  await page.getByLabel('Standard views').selectOption(process.env.VIEW);
}

await page.waitForTimeout(1200);
await page.screenshot({ path: output });
await browser.close();

if (errors.length) {
  console.error(`Console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
