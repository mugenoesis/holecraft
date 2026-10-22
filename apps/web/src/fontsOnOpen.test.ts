import { addShape, createEmptyDesign, type Design, type ShapeNode } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDesign } from './designsApi.ts';
import { getLibraryShape } from './libraryApi.ts';

/* A design (or a saved shape) with text in a font that has not loaded: opening it loads the font first, so nothing measures the words before they can be. */

const calls: number[][] = [];
vi.mock('@holecraft/core', async (original) => {
	const core = await original<typeof import('@holecraft/core')>();
	return {
		...core,
		loadFonts: async (ids: Iterable<number>) => {
			calls.push([...ids]);
			await core.loadFonts(ids);
		},
	};
});

const withScript = (): Design => {
	const base = createEmptyDesign('0123456789abcdef0123456789abcdef', 'D');
	const made = addShape(base, 'text', [0, 0], { id: 't' });
	const node = made.design.nodes.t as ShapeNode;
	return { ...made.design, nodes: { ...made.design.nodes, t: { ...node, params: { ...node.params, font: 4 } } } };
};

beforeEach(() => {
	calls.length = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(withScript()), { status: 200, headers: { 'content-type': 'application/json' } })),
	);
});
afterEach(() => vi.unstubAllGlobals());

describe('opening something that has text', () => {
	it('a design loads the fonts its text uses', async () => {
		await getDesign('0123456789abcdef0123456789abcdef');
		expect(calls).toEqual([[4]]);
	});

	it('a saved shape loads the fonts its text uses', async () => {
		await getLibraryShape('0123456789abcdef0123456789abcdef');
		expect(calls).toEqual([[4]]);
	});
});
