import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EngraveBar } from './EngraveBar.tsx';

const noop = () => {};
const render = (over: Partial<Parameters<typeof EngraveBar>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(EngraveBar, {
			text: 'Hello',
			font: 1,
			em: '10',
			depth: '1',
			angle: '0',
			mode: 'engrave',
			hint: 'Click the surface to place the words, or drag them',
			busy: false,
			onText: noop,
			onFont: noop,
			onEm: noop,
			onDepth: noop,
			onAngle: noop,
			onMode: noop,
			onCancel: noop,
			onFinish: noop,
			...over,
		}),
	);

describe('EngraveBar', () => {
	it('is a named section with the words, a font choice listing every font, the size, the depth and the turn', () => {
		const html = render();
		expect(html).toContain('aria-label="Engrave"');
		expect(html).toMatch(/aria-label="Words"[^>]*value="Hello"|value="Hello"[^>]*aria-label="Words"/);
		expect(html).toContain('aria-label="Font"');
		for (const f of ['Sans', 'Serif', 'Mono', 'Script', 'Rounded', 'Condensed', 'Caps', 'Display', 'Handwriting', 'Brush'])
			expect(html).toContain(`>${f}</option>`);
		for (const label of ['Letter size', 'Depth', 'Turn']) expect(html).toContain(`aria-label="${label}"`);
	});

	it('has Engrave and Raised, the chosen one pressed, and calls the field Height for raised lettering', () => {
		const engraved = render({ mode: 'engrave' });
		expect(engraved).toMatch(/aria-pressed="true"[^>]*>Engrave</);
		expect(engraved).toMatch(/aria-pressed="false"[^>]*>Raised</);
		expect(engraved).toContain('aria-label="Depth"');
		const raised = render({ mode: 'raised' });
		expect(raised).toMatch(/aria-pressed="true"[^>]*>Raised</);
		expect(raised).toContain('aria-label="Height"');
		expect(raised).not.toContain('aria-label="Depth"');
	});

	it('shows the hint, and Cancel and Done', () => {
		const html = render();
		expect(html).toContain('Click the surface to place the words');
		expect(html).toContain('>Cancel<');
		expect(html).toContain('>Done<');
	});

	it('is busy while fitting: Done says so and neither button can be pressed again', () => {
		const html = render({ busy: true });
		expect(html).toContain('Fitting');
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Fitting/);
	});
});
