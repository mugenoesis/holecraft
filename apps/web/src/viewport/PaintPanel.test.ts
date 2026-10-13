import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PaintPanel } from './PaintPanel.tsx';

const PALETTE = ['#f28c28', '#2a9d8f', '#e76f51', '#8d99ae'];
const noop = () => {};
const render = (over: Partial<Parameters<typeof PaintPanel>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(PaintPanel, {
			palette: PALETTE,
			filament: 1,
			tool: 'smart',
			angle: 30,
			shape: 'circle',
			size: 6,
			height: 2,
			gapArea: 1,
			canGapFill: true,
			status: null,
			canErase: true,
			onFilament: noop,
			onTool: noop,
			onAngle: noop,
			onShape: noop,
			onSize: noop,
			onHeight: noop,
			onGapArea: noop,
			onGapFill: noop,
			onEraseAll: noop,
			onDone: noop,
			...over,
		}),
	);

describe('the Paint panel', () => {
	it('has a numbered swatch for each filament in the palette, the chosen one pressed', () => {
		const html = render();
		for (const [i, hex] of PALETTE.entries()) expect(html).toContain(`aria-label="Filament ${i + 1}: ${hex}"`);
		expect(html).toMatch(/aria-label="Filament 2: #2a9d8f"[^>]*aria-pressed="true"/);
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
		expect(html).toMatch(/background:#f28c28[^>]*>1<\/button>/);
	});

	it('offers Smart fill and Bucket fill, with the one in use checked, and Brush shown as coming later', () => {
		const smart = render({ tool: 'smart' });
		const bucket = render({ tool: 'bucket' });
		expect(smart).toMatch(/aria-label="Smart fill"[^>]*checked=""/);
		expect(bucket).toMatch(/aria-label="Bucket fill"[^>]*checked=""/);
		expect(bucket).not.toMatch(/aria-label="Smart fill"[^>]*checked=""/);
		expect(smart).not.toMatch(/aria-label="Brush"[^>]*disabled/);
		expect(render({ tool: 'brush' })).toMatch(/aria-label="Brush"[^>]*checked=""/);
	});

	it('has a Smart fill angle slider from 0 to 90 showing the angle, which a bucket fill does not use', () => {
		const smart = render({ angle: 45 });
		expect(smart).toMatch(/<input[^>]*aria-label="Smart fill angle"[^>]*max="90"[^>]*value="45"/);
		expect(smart).toContain('45°');
		expect(smart).not.toMatch(/aria-label="Smart fill angle"[^>]*disabled/);
		expect(render({ tool: 'bucket' })).toMatch(/aria-label="Smart fill angle"[^>]*disabled=""/);
	});

	it('says how to use it, shows a problem in its place, and has Erase all (off when nothing can be erased) and Done', () => {
		expect(render()).toMatch(/Click a face to paint it/);
		expect(render({ status: 'Box 1 is locked' })).toContain('Box 1 is locked');
		expect(render({ status: 'Box 1 is locked' })).not.toMatch(/Click a face to paint it/);
		expect(render({ canErase: false })).toMatch(/<button[^>]*disabled=""[^>]*>Erase all<\/button>/);
		expect(render()).not.toMatch(/<button[^>]*disabled=""[^>]*>Erase all<\/button>/);
		expect(render()).toMatch(/<button[^>]*class="primary"[^>]*>Done<\/button>/);
	});
});

describe('the Paint panel’s brush', () => {
	const brush = (over: Partial<Parameters<typeof PaintPanel>[0]> = {}) => render({ tool: 'brush', ...over });

	it('shows the brush shapes and size only while the Brush is the tool', () => {
		expect(render()).not.toContain('Brush size');
		expect(render()).not.toContain('Brush shape');
		expect(brush()).toContain('Brush shape');
		expect(brush()).toMatch(/<input[^>]*aria-label="Brush size"[^>]*max="60"[^>]*value="6"/);
		expect(brush({ size: 12 })).toContain('12 mm');
	});

	it('offers Circle, Sphere and Triangles, with the one in use checked', () => {
		for (const [shape, label] of [
			['circle', 'Circle'],
			['sphere', 'Sphere'],
			['triangle', 'Triangles'],
		] as const) {
			const html = brush({ shape });
			expect(html).toMatch(new RegExp(`aria-label="${label}"[^>]*checked=""`));
			for (const other of ['Circle', 'Sphere', 'Triangles'].filter((l) => l !== label)) {
				expect(html).not.toMatch(new RegExp(`aria-label="${other}"[^>]*checked=""`));
			}
		}
	});

	it('has no size for a Triangles brush (it paints one triangle), and tells how to use the brush in the hint', () => {
		expect(brush({ shape: 'triangle' })).toMatch(/aria-label="Brush size"[^>]*disabled=""/);
		expect(brush()).not.toMatch(/aria-label="Brush size"[^>]*disabled/);
		expect(brush()).toMatch(/Drag to paint/);
		expect(brush()).toMatch(/Ctrl\+wheel changes the brush size/);
	});

	it('does not offer the smart fill angle for the brush (it is not used)', () => {
		expect(brush()).toMatch(/aria-label="Smart fill angle"[^>]*disabled=""/);
	});
});

describe('the Paint panel’s height range and gap fill', () => {
	it('offers Height range and Gap fill as tools, with the one in use checked', () => {
		for (const [tool, label] of [
			['height', 'Height range'],
			['gaps', 'Gap fill'],
		] as const) {
			expect(render({ tool })).toMatch(new RegExp(`aria-label="${label}"[^>]*checked=""`));
		}
		expect(render()).toMatch(/aria-label="Height range"/);
		expect(render()).not.toMatch(/aria-label="Height range"[^>]*checked=""/);
	});

	it('shows the Height range slider (0.1 to 50 mm) only for that tool, with its value in mm', () => {
		expect(render()).not.toContain('id="paint-height"');
		const html = render({ tool: 'height', height: 2.5 });
		expect(html).toMatch(/id="paint-height"/);
		expect(html).toMatch(/aria-label="Height range value"[^>]*max="50"|max="50"[^>]*aria-label="Height range value"/);
		expect(html).toContain('2.5 mm');
		expect(html).toMatch(/Click to paint a band/);
	});

	it('shows the Gap area slider (0 to 5) and an Apply button for Gap fill, the button off when nothing can be tidied', () => {
		const html = render({ tool: 'gaps', gapArea: 1.2 });
		expect(html).toMatch(/aria-label="Gap area"[^>]*max="5"|max="5"[^>]*aria-label="Gap area"/);
		expect(html).toContain('1.2 mm²');
		expect(html).toMatch(/<button[^>]*>Apply<\/button>/);
		expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Apply<\/button>/);
		expect(render({ tool: 'gaps', canGapFill: false })).toMatch(/<button[^>]*disabled=""[^>]*>Apply<\/button>/);
		expect(render()).not.toContain('Gap area');
	});
});
