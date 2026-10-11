// Screenshots a page with software WebGL and prints any console errors.
// Usage: node scripts/lib/screenshot.mjs <url> <out.png> [width] [height]
// Env:   DASHBOARD=1   stay on the designs list instead of opening a new design
//        DEMO=1        drop a few shapes on the workplane first
//        VIEW=<name>   pick a standard view first (front, back, left, right, top, bottom, iso)
//        CLICK=dx,dy   click this many pixels from the viewport centre (selects what is there)
//        FILL="Rotate Z=45;Width=30"  type into Properties fields of the selected shape (after CLICK)
//        BUTTON=Hole,Group  click buttons by name, in order, after PRESS
//        WAIT=ms       wait this long before the screenshot (e.g. for a thumbnail to be taken)
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

// The app opens on the list of designs. Make a new one to get to the editor, unless DASHBOARD=1.
if (process.env.DASHBOARD !== '1' && new URL(url).pathname === '/') {
  await page.getByRole('button', { name: 'New design' }).click();
  await page.getByTestId('viewport').waitFor();
}

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
for (const pair of (process.env.FILL ?? '').split(';').filter(Boolean)) {
  const [label, value] = pair.split('=');
  const input = page.getByRole('region', { name: 'Properties' }).getByLabel(label.trim(), { exact: true });
  await input.fill(value.trim());
  await input.press('Enter');
}
for (const key of (process.env.PRESS ?? '').split(',').filter(Boolean)) {
  await page.keyboard.press(key);
}
for (const name of (process.env.BUTTON ?? '').split(',').filter(Boolean)) {
  await page.getByRole('button', { name: name.trim(), exact: true }).click();
}
if (process.env.VIEW) {
  await page.getByLabel('Standard views').selectOption(process.env.VIEW);
}

await page.waitForTimeout(1200);
if (process.env.WAIT) await page.waitForTimeout(Number(process.env.WAIT));
await page.screenshot({ path: output });
await browser.close();

if (errors.length) {
  console.error(`Console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
}
