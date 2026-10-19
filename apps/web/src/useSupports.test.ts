import { addShape, addSupportPoint, createEmptyDesign, type Design, setNodeMode, setSupportPoints } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { pointsSummary, savedChoices, startingPrinter, whyNotSupports } from './useSupports.ts';

const READY = { url: 'http://t:8000', hasKey: true };

function oneBox(): Design {
	return addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'b' }).design;
}

describe('whyNotSupports', () => {
	it('is null when there is something to print, a Trident and a printer', () => {
		expect(whyNotSupports(oneBox(), READY, 'Elegoo Mars 3')).toBeNull();
	});

	it('points to Trident when none is set up, and waits while it finds out', () => {
		expect(whyNotSupports(oneBox(), { url: null, hasKey: false }, 'X')).toMatch(/set one up under Export, Send to Trident/);
		expect(whyNotSupports(oneBox(), null, 'X')).toMatch(/Looking/);
	});

	it('asks for a printer', () => {
		expect(whyNotSupports(oneBox(), READY, '')).toMatch(/Choose the printer/);
	});

	it('needs a solid shape to put supports on', () => {
		expect(whyNotSupports(createEmptyDesign('e'), READY, 'X')).toMatch(/Add a solid shape/);
		expect(whyNotSupports(setNodeMode(oneBox(), ['b'], 'hole'), READY, 'X')).toMatch(/Add a solid shape/);
	});
});

describe('pointsSummary', () => {
	it('says how many points there are and where they came from', () => {
		let d = setSupportPoints(oneBox(), {
			objects: [{ points: [1, 2, 3].map((x) => ({ x, y: 0, z: 0, radius: 0.4, type: 'island' as const })) }],
		});
		d = addSupportPoint(d, { object: 0, x: 9, y: 9, z: 0, radius: 0.4 });
		expect(pointsSummary(d)).toBe('4 points (3 from Trident, 1 added by you)');
	});

	it('speaks of one point in the singular, and of none', () => {
		const one = addSupportPoint(oneBox(), { object: 0, x: 9, y: 9, z: 0, radius: 0.4 });
		expect(pointsSummary(one)).toBe('1 point (added by you)');
		expect(pointsSummary(oneBox())).toBe('No points yet');
	});

	it('says when every point is Trident’s', () => {
		const d = setSupportPoints(oneBox(), { objects: [{ points: [{ x: 1, y: 0, z: 0, radius: 0.4, type: 'island' }] }] });
		expect(pointsSummary(d)).toBe('1 point (from Trident)');
	});
});

describe('savedChoices', () => {
	const printers = [
		{ name: 'UniFormation GKtwo', vendor: 'UniFormation' },
		{ name: 'Elegoo Mars 3', vendor: 'Elegoo' },
	];

	it('offers each saved printer by its own name, standing for the catalogue printer it is', () => {
		expect(savedChoices([{ name: 'gk2', printer: 'UniFormation GKtwo' }], printers)).toEqual([
			{ printer: 'UniFormation GKtwo', label: 'gk2 (UniFormation GKtwo)' },
		]);
	});

	it('leaves out one whose printer Trident no longer lists', () => {
		expect(savedChoices([{ name: 'old', printer: 'Nobody Printer' }], printers)).toEqual([]);
	});
});

describe('startingPrinter', () => {
	const saved = [{ printer: 'UniFormation GKtwo', label: 'gk2 (UniFormation GKtwo)' }];
	const printers = [{ name: 'UniFormation GKtwo', vendor: 'UniFormation' }];

	it('keeps the printer chosen before, if Trident still lists it', () => {
		expect(startingPrinter('UniFormation GKtwo', saved, printers)).toBe('UniFormation GKtwo');
	});

	it('starts on the first saved printer when none was chosen', () => {
		expect(startingPrinter('', saved, printers)).toBe('UniFormation GKtwo');
	});

	it('starts on nothing when none was chosen and none is saved', () => {
		expect(startingPrinter('', [], printers)).toBe('');
	});
});
