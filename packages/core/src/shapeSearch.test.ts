import { describe, expect, it } from 'vitest';
import { filterShapes, SHAPE_CATEGORIES } from './shapeSearch.ts';
import { SHAPE_DEFS } from './shapes.ts';

const ids = (query: string, category: Parameters<typeof filterShapes>[1] = 'all') => filterShapes(query, category).map((d) => d.id);

describe('the shape categories', () => {
	it('are Basic, Parametric and Fasteners, in that order, and every shape is in exactly one', () => {
		expect(SHAPE_CATEGORIES.map((c) => c.label)).toEqual(['Basic', 'Parametric', 'Fasteners']);
		const known = new Set(SHAPE_CATEGORIES.map((c) => c.id));
		for (const def of SHAPE_DEFS) expect(known.has(def.category)).toBe(true);
		const counts = SHAPE_CATEGORIES.map((c) => SHAPE_DEFS.filter((d) => d.category === c.id).length);
		expect(counts).toEqual([10, 4, 6]);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(SHAPE_DEFS.length);
	});

	it('hold the shapes you would expect', () => {
		expect(ids('', 'basic')).toEqual([
			'box',
			'cylinder',
			'sphere',
			'cone',
			'pyramid',
			'wedge',
			'roof',
			'round-roof',
			'half-sphere',
			'hexagon',
		]);
		expect(ids('', 'parametric')).toEqual(['tube', 'torus', 'star', 'polygon']);
		expect(ids('', 'fasteners')).toEqual(['threaded-rod', 'threaded-hole', 'bolt', 'nut', 'washer', 'standoff']);
	});
});

describe('filterShapes', () => {
	it('gives every shape, in the panel’s order, for no search in All', () => {
		expect(ids('')).toEqual(SHAPE_DEFS.map((d) => d.id));
		expect(ids('   ')).toEqual(SHAPE_DEFS.map((d) => d.id));
	});

	it('finds a shape by its name, ignoring case and spaces round the search', () => {
		expect(ids('nut')).toEqual(['nut']);
		expect(ids('  NUT ')).toEqual(['nut']);
		expect(ids('half sphere')).toEqual(['half-sphere']);
	});

	it('finds a shape by what it is also called: a ring is a tube, a torus or a washer; a screw is a rod, a hole or a bolt', () => {
		expect(ids('ring')).toEqual(['tube', 'torus', 'washer']);
		expect(ids('screw')).toEqual(['threaded-rod', 'threaded-hole', 'bolt']);
		expect(ids('donut')).toEqual(['torus']);
		expect(ids('cube')).toEqual(['box']);
	});

	it('puts names that start with the search first, then names with a word that does, then the rest in the panel’s order', () => {
		expect(ids('roo')).toEqual(['roof', 'round-roof']);
		expect(ids('hex')).toEqual(['hexagon', 'nut', 'standoff']); // the name first, then what is also called hex
		expect(ids('sphere')).toEqual(['sphere', 'half-sphere']);
		// a word of the name beats another name, even though the cylinder comes first in the panel
		expect(ids('rod')).toEqual(['threaded-rod', 'cylinder']);
	});

	it('needs every word of the search to match something', () => {
		expect(ids('hex nut')).toEqual(['nut']);
		expect(ids('hex nut banana')).toEqual([]);
	});

	it('narrows to a category, together with a search', () => {
		expect(ids('hex', 'fasteners')).toEqual(['nut', 'standoff']);
		expect(ids('hex', 'basic')).toEqual(['hexagon']);
		expect(ids('nut', 'basic')).toEqual([]);
	});

	it('gives nothing for a search that matches nothing', () => {
		expect(ids('zzz')).toEqual([]);
	});
});
