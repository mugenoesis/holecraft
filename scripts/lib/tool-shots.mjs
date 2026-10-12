// Drives the ruler, the Workplane tool and the Edge tool in a real browser and saves screenshots, so they can be looked at.
// Usage: node scripts/lib/tool-shots.mjs <url> <out-dir> [width] [height]
// Writes ruler.png, plane-top.png, plane-wall.png, plane-wall-iso.png, edges-*.png into <out-dir>.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url, outDir, width = '1280', height = '800'] = process.argv.slice(2);
if (!url || !outDir) {
	console.error('Usage: tool-shots.mjs <url> <out-dir> [width] [height]');
	process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function freshEditor() {
	const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'New design' }).click();
	await page.getByTestId('viewport').waitFor();
	return page;
}

const centre = async (page) => {
	const b = await page.getByTestId('viewport').boundingBox();
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const view = async (page, name) => {
	await page.getByLabel('Standard views').selectOption(name);
	await page.waitForTimeout(700);
};
const click = async (page, dx, dy) => {
	const c = await centre(page);
	await page.mouse.click(c.x + dx, c.y + dy);
};
// 1. the ruler: from the floor beside a box to the top of the box, seen from an angle
{
	const page = await freshEditor();
	await page.getByRole('button', { name: 'Box', exact: true }).click();
	await view(page, 'top');
	await page.getByRole('button', { name: 'Ruler', exact: true }).click();
	await click(page, 120, 0);
	await click(page, 0, 0);
	await view(page, 'iso');
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${outDir}/ruler.png` });
	console.log('ruler readout:', await page.getByTestId('ruler-readout').innerText());
	await page.close();
}

// 2. the workplane tool on the top of a box: marker, then a cylinder standing on it
{
	const page = await freshEditor();
	await page.getByRole('button', { name: 'Box', exact: true }).click();
	await view(page, 'top');
	await page.getByRole('button', { name: 'Workplane', exact: true }).click();
	await click(page, 0, 0);
	await view(page, 'iso');
	await page.screenshot({ path: `${outDir}/plane-top-marker.png` });
	await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${outDir}/plane-top.png` });
	await page.close();
}

// 3. the workplane tool on the front wall of a box: marker, then a cylinder sticking out of the wall
{
	const page = await freshEditor();
	await page.getByRole('button', { name: 'Box', exact: true }).click();
	await view(page, 'front');
	await page.getByRole('button', { name: 'Workplane', exact: true }).click();
	await click(page, 0, -27); // the middle of the front face (10 mm up, about 2.7 px per mm)
	await view(page, 'iso');
	await page.screenshot({ path: `${outDir}/plane-wall-marker.png` });
	await page.getByRole('button', { name: 'Cylinder', exact: true }).click();
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${outDir}/plane-wall-iso.png` });
	await view(page, 'right');
	await page.screenshot({ path: `${outDir}/plane-wall.png` });
	await page.close();
}

// 4. the Edge tool on a box: edges drawn, one hovered, two chosen with a chamfer previewed, then applied and shown as treated
{
	const page = await freshEditor();
	await page.getByRole('button', { name: 'Box', exact: true }).click();
	await page.getByTestId('object-list').locator('li').first().locator('button').first().click();
	await view(page, 'iso');
	await page.keyboard.press('f');
	await page.waitForTimeout(700);
	await page.getByRole('button', { name: 'Edges', exact: true }).click();
	await page.getByTestId('edge-line').first().waitFor({ state: 'attached' });
	const canvas = await page.getByTestId('viewport').locator('canvas').boundingBox();
	const middleOf = async (selector) => {
		const line = page.locator(`${selector} line`).first();
		const at = async (a) => Number(await line.getAttribute(a));
		return { x: canvas.x + ((await at('x1')) + (await at('x2'))) / 2, y: canvas.y + ((await at('y1')) + (await at('y2'))) / 2 };
	};
	const frontRight = '[data-testid="edge-line"][data-from="10,-10,0"][data-to="10,-10,20"]';
	const topFront = '[data-testid="edge-line"][data-from="-10,-10,20"][data-to="10,-10,20"]';
	const a = await middleOf(frontRight);
	await page.mouse.move(a.x, a.y);
	await page.waitForTimeout(200);
	await page.screenshot({ path: `${outDir}/edges-hover.png` });
	await page.mouse.click(a.x, a.y);
	const b = await middleOf(topFront);
	await page.keyboard.down('Shift');
	await page.mouse.click(b.x, b.y);
	await page.keyboard.up('Shift');
	await page.getByTestId('edge-tool').getByLabel('Size', { exact: true }).fill('4');
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${outDir}/edges-preview.png` });
	await page.getByTestId('edge-tool').getByLabel('Round').check();
	await page.waitForTimeout(1500);
	await page.screenshot({ path: `${outDir}/edges-preview-round.png` });
	await page.getByRole('button', { name: 'Apply' }).click();
	await page.mouse.move(canvas.x + 20, canvas.y + canvas.height - 20);
	await page.waitForTimeout(1000);
	await page.screenshot({ path: `${outDir}/edges-applied.png` });
	console.log('edge tool bar:', await page.getByTestId('edge-tool').innerText());
	await page.close();
}

await browser.close();
if (errors.length) {
	console.error(`Console errors:\n${errors.join('\n')}`);
	process.exitCode = 1;
}
