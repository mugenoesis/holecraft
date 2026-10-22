import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { engraveParams } from './engraveRecord.ts';
import { frameOfPlane } from './sketchFrame.ts';

/*
 * Fonts load when a design needs them: the default (Sans) is part of the code, and each of the others is its own file, fetched the first time.
 * These tests use a fresh copy of the module each time, so they see the state of a page that has just opened. (Every other test file has all the
 * fonts loaded for it by vitest.setup.ts.)
 */

afterEach(() => vi.resetModules());

const fresh = async () => {
	vi.resetModules();
	return import('./text.ts');
};

describe('a page that has just opened', () => {
	it('has the default font ready, and no other', async () => {
		const t = await fresh();
		expect(t.fontLoaded(1)).toBe(true);
		for (const id of [2, 3, 4, 5, 6, 7, 8, 9, 10]) expect(t.fontLoaded(id), `font ${id}`).toBe(false);
		expect(t.textMetrics('Hi', 1)).not.toBeNull();
	});

	it('lists every font by name without having loaded any outlines', async () => {
		const t = await fresh();
		expect(t.FONTS.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		expect(t.FONTS[0]?.label).toBe('Sans');
		expect(t.FONTS[3]?.label).toBe('Script');
	});

	it('cannot set words in a font that is not loaded yet, and can once it is', async () => {
		const t = await fresh();
		expect(t.textMetrics('Hi', 4)).toBeNull();
		expect(t.textOutlines('Hi', 4)).toBeNull();
		expect(await t.loadFont(4)).toBe(true);
		expect(t.fontLoaded(4)).toBe(true);
		expect(t.textMetrics('Hi', 4)).not.toBeNull();
		expect(t.textOutlines('Hi', 4)?.polygons.length).toBeGreaterThan(0);
	});

	it('loads a font once, however many ask at the same time', async () => {
		const t = await fresh();
		const [a, b] = await Promise.all([t.loadFont(7), t.loadFont(7)]);
		expect([a, b]).toEqual([true, true]);
		expect(t.fontById(7)).toBe(t.fontById(7));
	});

	it('loads several at once, and ignores ids that are not fonts', async () => {
		const t = await fresh();
		await t.loadFonts([2, 3, 99, 0, Number.NaN]);
		expect(t.fontLoaded(2) && t.fontLoaded(3)).toBe(true);
		expect(t.fontLoaded(99)).toBe(false);
		expect(await t.loadFont(99)).toBe(false);
	});

	it('knows which ids are fonts without loading them', async () => {
		const t = await fresh();
		expect(t.isFontId(4)).toBe(true);
		expect(t.isFontId(11)).toBe(false);
		expect(t.isFontId(0)).toBe(false);
		expect(t.isFontId(2.5)).toBe(false);
	});

	it('gives the same letters as when everything was built in: a font read lazily has all its glyphs', async () => {
		const t = await fresh();
		await t.loadFont(10);
		const m = t.textMetrics('Hello, World!', 10);
		expect(m?.unsupported).toBe(0);
		expect(m?.width).toBeGreaterThan(3);
	});
});

describe('fontOf keeps a font id that is not loaded yet', () => {
	it('(a text shape asks for its font before the page has it, and must not fall back to Sans)', async () => {
		vi.resetModules();
		const { fontOf } = await import('./textShape.ts');
		expect(fontOf({ params: { font: 4 } })).toBe(4);
		expect(fontOf({ params: { font: 99 } })).toBe(1);
		expect(fontOf({ params: {} })).toBe(1);
	});
});

describe('fontsUsedBy', () => {
	it('lists the fonts of the text shapes and engravings in some nodes, once each, in order', async () => {
		const { fontsUsedBy } = await import('./fontUse.ts');
		const text = (id: string, font: number) => ({ id, kind: 'shape', shapeType: 'text', params: { font } });
		const engraving = (id: string, font: number) => ({
			id,
			kind: 'shape',
			shapeType: 'mesh',
			params: engraveParams({
				settings: { text: 'x', font, em: 5, angle: 0, at: [0, 0], depth: 1, mode: 'engrave' },
				frame: frameOfPlane({ origin: [0, 0, 0], normal: [0, 0, 1] }),
			}),
		});
		const box = { id: 'b', kind: 'shape', shapeType: 'box', params: { font: 5 } };
		const nodes = Object.fromEntries([text('a', 4), text('c', 4), text('d', 9), engraving('e', 2), box].map((n) => [n.id, n]));
		expect(fontsUsedBy(nodes as never)).toEqual([2, 4, 9]);
	});

	it('leaves out ids that are not fonts, and a design with no text needs none', async () => {
		const { fontsUsedBy } = await import('./fontUse.ts');
		expect(fontsUsedBy(createEmptyDesign('0123456789abcdef0123456789abcdef', 'D').nodes)).toEqual([]);
		const bad = {
			a: { id: 'a', kind: 'shape', shapeType: 'text', params: { font: 99 } },
			b: { id: 'b', kind: 'shape', shapeType: 'text', params: {} },
		};
		expect(fontsUsedBy(bad as never)).toEqual([]);
	});
});
