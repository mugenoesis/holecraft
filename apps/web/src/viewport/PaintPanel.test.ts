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
			status: null,
			canErase: true,
			onFilament: noop,
			onTool: noop,
			onAngle: noop,
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
		expect(smart).toMatch(/aria-label="Brush"[^>]*disabled=""/);
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
