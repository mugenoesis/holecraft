import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CavityNote } from './CavityNote.tsx';

const CAVITY = { layer: 16, z: 8.25, areaMm2: 256.4 };
const note = (cavity: typeof CAVITY | null, drained = false, canDrain = true) =>
	renderToStaticMarkup(createElement(CavityNote, { cavity, drained, canDrain, onDrain: () => {} }));

describe('the closed cavity note', () => {
	it('says how big the cavity is and where, and offers a drain hole', () => {
		const html = note(CAVITY);
		expect(html).toContain('Closed cavity');
		expect(html).toContain('256 mm²');
		expect(html).toContain('8.3 mm');
		expect(html).toContain('cupping');
		expect(html).toContain('Add drain hole');
	});

	it('says the cavity is open once a drain hole has been added', () => {
		const html = note(null, true);
		expect(html).toContain('No closed cavity');
		expect(html).not.toContain('Add drain hole');
	});

	it('shows nothing when there is no cavity', () => {
		expect(note(null)).toBe('');
	});

	it('turns the button off when a drain hole cannot be added', () => {
		expect(note(CAVITY, false, false)).toContain('disabled');
	});
});
