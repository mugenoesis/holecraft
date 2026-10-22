import { describe, expect, it } from 'vitest';
import { FONTS, fontById, TEXT_MAX_LENGTH, textMetrics, textOutlines } from './text.ts';

const SANS = fontById(1)!;

const area = (poly: readonly (readonly [number, number])[]) =>
	poly.reduce((sum, [x, y], i) => sum + (x * poly[(i + 1) % poly.length]![1] - poly[(i + 1) % poly.length]![0] * y), 0) / 2;

describe('the fonts', () => {
	it('are ten open fonts, each with the letters of Basic Latin and Latin-1; the first four keep the ids saved designs use', () => {
		expect(FONTS.map((f) => [f.id, f.label])).toEqual([
			[1, 'Sans'],
			[2, 'Serif'],
			[3, 'Mono'],
			[4, 'Script'],
			[5, 'Rounded'],
			[6, 'Condensed'],
			[7, 'Caps'],
			[8, 'Display'],
			[9, 'Handwriting'],
			[10, 'Brush'],
		]);
		for (const f of FONTS) {
			const data = fontById(f.id)!;
			expect(data.unitsPerEm).toBeGreaterThan(0);
			for (const ch of 'AZaz09 .,!?@&é€'.replace('€', 'ü')) expect(data.glyphs[ch.codePointAt(0)!], `${f.label} has ${ch}`).toBeTruthy();
			expect(data.glyphs[0x41]!.advance).toBeGreaterThan(0);
		}
		expect(fontById(99)).toBeUndefined();
	});

	it('Mono is fixed width: every letter moves the pen on by the same distance', () => {
		const mono = fontById(3)!;
		const widths = new Set(['i', 'W', 'm', '1', '.'].map((c) => mono.glyphs[c.codePointAt(0)!]!.advance));
		expect(widths.size).toBe(1);
	});
});

describe('textMetrics', () => {
	it('is the size of the ink in ems (so 0.7 is 7 mm at a 10 mm em): Inter’s capital H is about 0.73 em high', () => {
		const h = textMetrics('H', 1)!;
		expect(h.depth).toBeGreaterThan(0.7);
		expect(h.depth).toBeLessThan(0.76);
		const data = SANS.glyphs[0x48]!;
		expect(h.depth).toBeCloseTo((data.box[3] - data.box[1]) / SANS.unitsPerEm, 9);
		expect(h.width).toBeCloseTo((data.box[2] - data.box[0]) / SANS.unitsPerEm, 9);
	});

	it('moves along by each letter’s advance: HH is H wider by exactly one advance', () => {
		const [one, two] = [textMetrics('H', 1)!, textMetrics('HH', 1)!];
		expect(two.width - one.width).toBeCloseTo(SANS.glyphs[0x48]!.advance / SANS.unitsPerEm, 9);
		expect(two.depth).toBeCloseTo(one.depth, 9);
	});

	it('takes the height of the tallest and the lowest of its letters (a descender makes it deeper)', () => {
		expect(textMetrics('Hg', 1)!.depth).toBeGreaterThan(textMetrics('H', 1)!.depth);
		expect(textMetrics('x', 1)!.depth).toBeLessThan(textMetrics('H', 1)!.depth);
	});

	it('does not count the spaces at the ends (they have no ink) but does count one in the middle', () => {
		expect(textMetrics('  H  ', 1)!.width).toBeCloseTo(textMetrics('H', 1)!.width, 9);
		expect(textMetrics('H H', 1)!.width).toBeGreaterThan(textMetrics('HH', 1)!.width);
	});

	it('counts the letters the font does not have, and is nothing for a text with no ink', () => {
		expect(textMetrics('Hi中文', 1)!.unsupported).toBe(2);
		expect(textMetrics('Hi', 1)!.unsupported).toBe(0);
		expect(textMetrics('', 1)).toBeNull();
		expect(textMetrics('   ', 1)).toBeNull();
		expect(textMetrics('中', 1)).toBeNull();
		expect(textMetrics('Hi', 99)).toBeNull();
	});

	it('is cut off at the longest text a shape may have', () => {
		expect(TEXT_MAX_LENGTH).toBe(100);
		expect(textMetrics('i'.repeat(150), 1)!.width).toBeCloseTo(textMetrics('i'.repeat(100), 1)!.width, 9);
	});
});

describe('textOutlines', () => {
	it('gives the outline of each letter as closed polygons in ems, with y up, and the box they fill', () => {
		const out = textOutlines('H', 1)!;
		expect(out.polygons).toHaveLength(1);
		const m = textMetrics('H', 1)!;
		expect(out.box.max[0] - out.box.min[0]).toBeCloseTo(m.width, 6);
		expect(out.box.max[1] - out.box.min[1]).toBeCloseTo(m.depth, 6);
		const ys = out.polygons.flat().map((p) => p[1]);
		expect(Math.min(...ys)).toBeCloseTo(out.box.min[1], 9);
	});

	it('gives a letter with a hole two contours, wound opposite ways (so filling by winding leaves the hole)', () => {
		const o = textOutlines('o', 1)!;
		expect(o.polygons).toHaveLength(2);
		const [a, b] = o.polygons.map(area) as [number, number];
		expect(Math.sign(a)).toBe(-Math.sign(b));
		expect(Math.abs(a) + b * Math.sign(a)).toBeGreaterThan(0); // the net area is the ring, which is positive
		expect(Math.abs(a + b)).toBeLessThan(Math.max(Math.abs(a), Math.abs(b)));
	});

	it('puts letters side by side: the second letter’s outline is the first’s moved along by the advance', () => {
		const [one, two] = [textOutlines('l', 1)!, textOutlines('ll', 1)!];
		expect(two.polygons).toHaveLength(2 * one.polygons.length);
		const advance = SANS.glyphs[0x6c]!.advance / SANS.unitsPerEm;
		const [first, second] = [two.polygons[0]!, two.polygons[1]!];
		expect(second[0]![0] - first[0]![0]).toBeCloseTo(advance, 6);
		expect(second[0]![1]).toBeCloseTo(first[0]![1], 9);
	});

	it('draws curves with enough pieces to look round: an O has well over twenty points', () => {
		expect(textOutlines('O', 1)!.polygons.flat().length).toBeGreaterThan(40);
	});

	it('skips letters it cannot draw and spaces, and gives nothing for a text with no ink', () => {
		expect(textOutlines('H中H', 1)!.polygons).toHaveLength(2);
		expect(textOutlines('H H', 1)!.polygons).toHaveLength(2);
		expect(textOutlines('', 1)).toBeNull();
		expect(textOutlines('H', 99)).toBeNull();
	});
});

describe('the added fonts', () => {
	it('each make ink for ordinary words, sized in ems, with every letter of Hello, 123 in them', () => {
		for (const f of FONTS) {
			const m = textMetrics('Hello, 123', f.id);
			expect(m, f.label).not.toBeNull();
			expect(m!.unsupported, f.label).toBe(0);
			expect(m!.width, f.label).toBeGreaterThan(2);
			expect(textOutlines('Hello, 123', f.id)!.polygons.length, f.label).toBeGreaterThan(8);
		}
	});

	it('are different from each other: the same words are a different width in every font', () => {
		const widths = FONTS.map((f) => textMetrics('Holecraft', f.id)!.width.toFixed(3));
		expect(new Set(widths).size).toBe(FONTS.length);
	});

	it('keep the outlines of the first four unchanged (a saved design must look as it did): the capital H is as it was', () => {
		const h = (id: number) => {
			const font = fontById(id)!;
			const g = font.glyphs[0x48]!;
			return [font.unitsPerEm, g.advance, ...g.box, g.path.length, Object.keys(font.glyphs).length];
		};
		expect(h(1)).toEqual([2048, 1530, 135, 0, 1395, 1490, 105, 190]);
		expect(h(2)).toEqual([1000, 819, 28, 0, 792, 714, 658, 191]);
		expect(h(3)).toEqual([2048, 1229, 123, 0, 1092, 1456, 101, 191]);
		expect(h(4)).toEqual([1000, 665, 12, 0, 694, 750, 294, 191]);
		expect(FONTS.slice(0, 4).map((f) => [f.id, f.label])).toEqual([
			[1, 'Sans'],
			[2, 'Serif'],
			[3, 'Mono'],
			[4, 'Script'],
		]);
	});
});
