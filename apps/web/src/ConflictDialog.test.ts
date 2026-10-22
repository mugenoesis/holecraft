import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConflictDialog } from './ConflictDialog.tsx';

const html = renderToStaticMarkup(createElement(ConflictDialog, { onKeepMine: () => {}, onLoadOther: () => {} }));

describe('ConflictDialog', () => {
	it('is a modal alert dialog that says the design was changed somewhere else', () => {
		expect(html).toContain('role="alertdialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toMatch(/changed somewhere else/i);
	});

	it('offers to keep this version or to load the other, each saying what it costs', () => {
		expect(html).toContain('>Keep my version<');
		expect(html).toContain('>Load the other version<');
		expect(html).toMatch(/replaces the other version/i);
		expect(html).toMatch(/loses? (the changes|your changes)|your unsaved changes/i);
	});

	it('has no way to close it that is neither (a choice has to be made)', () => {
		expect(html).not.toContain('>Cancel<');
		expect(html).not.toContain('>Close<');
	});
});
