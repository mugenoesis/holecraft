import { addShape, createEmptyDesign, type Design, setNodeMode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { savingNote, whyNotHollow } from './useHollow.ts';

const READY = { url: 'http://t:8000', hasKey: true };

function oneBox(): Design {
	return addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'b' }).design;
}

describe('whyNotHollow', () => {
	it('is null when a solid is selected, a Trident is set up and the wall is usable', () => {
		expect(whyNotHollow(oneBox(), ['b'], READY, 2)).toBeNull();
	});

	it('points to Trident when none is set up', () => {
		expect(whyNotHollow(oneBox(), ['b'], { url: null, hasKey: false }, 2)).toMatch(/Trident Studio: set one up under Export/);
	});

	it('says to select one shape when there are none or several, or a hole', () => {
		expect(whyNotHollow(oneBox(), [], READY, 2)).toMatch(/Select one shape/);
		expect(whyNotHollow(oneBox(), ['b', 'c'], READY, 2)).toMatch(/Select one shape/);
		expect(whyNotHollow(setNodeMode(oneBox(), ['b'], 'hole'), ['b'], READY, 2)).toMatch(/hole cannot be hollowed/);
	});

	it('names the wall it can take', () => {
		for (const wall of [0.4, 21, Number.NaN]) expect(whyNotHollow(oneBox(), ['b'], READY, wall)).toMatch(/between 0.5 and 20 mm/);
	});

	it('waits while it is still finding out about Trident', () => {
		expect(whyNotHollow(oneBox(), ['b'], null, 2)).toMatch(/Looking/);
	});
});

describe('savingNote', () => {
	it('says how much material is left and how much is saved', () => {
		expect(savingNote(8000, 3900)).toBe('Hollowed: 8,000 to 3,900 mm³, 51% less resin.');
	});
});
