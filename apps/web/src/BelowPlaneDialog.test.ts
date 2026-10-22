import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BelowPlaneDialog } from './BelowPlaneDialog.tsx';

describe('BelowPlaneDialog', () => {
	const html = renderToStaticMarkup(createElement(BelowPlaneDialog, { onChoose: () => {} }));

	it('is a modal dialog that says part of the design is below the workplane', () => {
		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toMatch(/below the workplane/i);
	});

	it('offers to cut it off, to export it as it is, and to cancel, each saying what it does', () => {
		expect(html).toContain('>Cut off at the workplane<');
		expect(html).toContain('>Export as it is<');
		expect(html).toContain('>Cancel<');
		expect(html).toMatch(/slicer/i);
	});
});
