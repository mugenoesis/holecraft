import { describe, expect, it } from 'vitest';
import { createEmptyDesign, DESIGN_FORMAT_VERSION, type Design } from './design.ts';
import { setNodeColor } from './edit.ts';
import { addShape } from './ops.ts';
import {
	addPaletteColor,
	DEFAULT_PALETTE,
	MAX_PALETTE_SIZE,
	paletteSlotOf,
	removePaletteColor,
	setPaletteColor,
	suggestPaletteColor,
} from './palette.ts';
import { parseDesign } from './validate.ts';

const empty = () => createEmptyDesign('d', 'T');
const withTwoShapes = (): Design => {
	let d = empty();
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design; // default box colour, palette slot 1
	d = addShape(d, 'cylinder', [50, 0], { id: 'b' }).design;
	return d;
};

describe('the default palette', () => {
	it("starts with the four colours of a typical multi-material printer, matching the shapes' default colours", () => {
		expect(DEFAULT_PALETTE).toHaveLength(4);
		expect(empty().palette).toEqual(DEFAULT_PALETTE);
		const d = withTwoShapes();
		expect(d.palette).toContain(d.nodes.a!.color);
		expect(d.palette).toContain(d.nodes.b!.color);
	});

	it('is a copy, so editing one design never changes the default', () => {
		const d = empty();
		d.palette.push('#000000');
		expect(DEFAULT_PALETTE).toHaveLength(4);
		expect(empty().palette).toHaveLength(4);
	});
});

describe('addPaletteColor', () => {
	it('adds a colour as the next filament', () => {
		const d = addPaletteColor(empty(), '#112233');
		expect(d.palette).toEqual([...DEFAULT_PALETTE, '#112233']);
	});

	it('lower-cases it and ignores things that are not colours', () => {
		expect(addPaletteColor(empty(), '#ABCDEF').palette.at(-1)).toBe('#abcdef');
		const d = empty();
		expect(addPaletteColor(d, 'red')).toBe(d);
		expect(addPaletteColor(d, '#12345')).toBe(d);
	});

	it('does not add a colour the palette already has', () => {
		const d = empty();
		expect(addPaletteColor(d, DEFAULT_PALETTE[1]!.toUpperCase())).toBe(d);
	});

	it(`stops at ${MAX_PALETTE_SIZE} colours, the most a Bambu printer can address`, () => {
		let d = empty();
		for (let i = 0; i < 30; i++) d = addPaletteColor(d, `#${(i + 16).toString(16).padStart(2, '0')}0000`);
		expect(d.palette).toHaveLength(MAX_PALETTE_SIZE);
	});
});

describe('setPaletteColor', () => {
	it('changes a slot and recolours every shape that was using it, so the slot keeps its meaning', () => {
		let d = withTwoShapes();
		const old = d.palette[0]!;
		const usingOld = Object.values(d.nodes)
			.filter((n) => n.color === old)
			.map((n) => n.id);
		expect(usingOld.length).toBeGreaterThan(0);
		d = setPaletteColor(d, 0, '#102030');
		expect(d.palette[0]).toBe('#102030');
		for (const id of usingOld) expect(d.nodes[id]!.color).toBe('#102030');
	});

	it('leaves shapes of other colours alone', () => {
		let d = withTwoShapes();
		d = setNodeColor(d, ['b'], '#abcdef');
		d = setPaletteColor(d, 0, '#102030');
		expect(d.nodes.b!.color).toBe('#abcdef');
	});

	it('recolours shapes inside groups too', () => {
		let d = withTwoShapes();
		const old = d.palette[0]!;
		// put the box inside a group by hand
		d = {
			...d,
			nodes: {
				...d.nodes,
				g: {
					id: 'g',
					kind: 'group',
					name: 'G',
					transform: [...d.nodes.a!.transform],
					mode: 'solid',
					color: old,
					hidden: false,
					locked: false,
					children: ['a'],
					op: 'union',
					multicolor: false,
				},
			},
			roots: ['g', 'b'],
		};
		d = setPaletteColor(d, 0, '#102030');
		expect(d.nodes.a!.color).toBe('#102030');
		expect(d.nodes.g!.color).toBe('#102030');
	});

	it('refuses a colour another slot already has, and bad slots and colours', () => {
		const d = empty();
		expect(setPaletteColor(d, 0, d.palette[1]!)).toBe(d);
		expect(setPaletteColor(d, 9, '#102030')).toBe(d);
		expect(setPaletteColor(d, -1, '#102030')).toBe(d);
		expect(setPaletteColor(d, 0, 'nope')).toBe(d);
	});

	it('does nothing when the colour is the same', () => {
		const d = empty();
		expect(setPaletteColor(d, 0, d.palette[0]!)).toBe(d);
	});
});

describe('removePaletteColor', () => {
	it('removes a slot, shifting the later ones up', () => {
		const d = removePaletteColor(empty(), 1);
		expect(d.palette).toEqual([DEFAULT_PALETTE[0], DEFAULT_PALETTE[2], DEFAULT_PALETTE[3]]);
	});

	it('keeps the colours of shapes that used it (they print as the nearest remaining filament)', () => {
		let d = withTwoShapes();
		const colour = d.nodes.b!.color;
		d = removePaletteColor(d, d.palette.indexOf(colour));
		expect(d.nodes.b!.color).toBe(colour);
	});

	it('never removes the last colour', () => {
		let d = empty();
		for (let i = 0; i < 10; i++) d = removePaletteColor(d, 0);
		expect(d.palette).toHaveLength(1);
	});

	it('ignores a slot that does not exist', () => {
		const d = empty();
		expect(removePaletteColor(d, 7)).toBe(d);
	});
});

describe('suggestPaletteColor', () => {
	it('suggests a colour the palette does not have yet', () => {
		const suggested = suggestPaletteColor(DEFAULT_PALETTE);
		expect(suggested).toMatch(/^#[0-9a-f]{6}$/);
		expect(DEFAULT_PALETTE).not.toContain(suggested);
	});

	it('keeps suggesting new ones as they are taken, all the way to the limit', () => {
		let palette: string[] = [...DEFAULT_PALETTE];
		while (palette.length < MAX_PALETTE_SIZE) {
			const next = suggestPaletteColor(palette);
			expect(palette).not.toContain(next);
			palette = [...palette, next];
		}
		expect(new Set(palette).size).toBe(MAX_PALETTE_SIZE);
	});

	it('still finds something when the usual suggestions are all used', () => {
		const palette = Array.from({ length: 15 }, (_, i) => `#${(i + 1).toString(16).padStart(2, '0')}0000`);
		expect(palette).not.toContain(suggestPaletteColor(palette));
	});
});

describe('paletteSlotOf', () => {
	const palette = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];

	it('is the slot with exactly that colour (numbered from 1, like filaments)', () => {
		expect(paletteSlotOf(palette, '#0000ff')).toBe(3);
		expect(paletteSlotOf(palette, '#FF0000')).toBe(1);
	});

	it('is the nearest slot for a colour that is not in the palette', () => {
		expect(paletteSlotOf(palette, '#fa1010')).toBe(1);
		expect(paletteSlotOf(palette, '#101090')).toBe(3);
		expect(paletteSlotOf(palette, '#f0f0e0')).toBe(4);
	});

	it('prefers the earlier slot when two are equally near', () => {
		expect(paletteSlotOf(['#000000', '#000000'], '#000000')).toBe(1);
	});

	it('works for any palette that has something in it, and falls back to slot 1 for a bad colour', () => {
		expect(paletteSlotOf(['#123456'], '#ffffff')).toBe(1);
		expect(paletteSlotOf(palette, 'not a colour')).toBe(1);
	});
});

describe('the palette in saved designs', () => {
	it('is saved and loaded', () => {
		let d = addPaletteColor(empty(), '#112233');
		d = setPaletteColor(d, 0, '#445566');
		expect(parseDesign(JSON.parse(JSON.stringify(d))).palette).toEqual(d.palette);
	});

	it('is added, with the default colours, to designs saved before it existed', () => {
		const old = JSON.parse(JSON.stringify(empty()));
		delete old.palette;
		old.formatVersion = 1;
		const loaded = parseDesign(old);
		expect(loaded.palette).toEqual(DEFAULT_PALETTE);
		expect(loaded.formatVersion).toBe(DESIGN_FORMAT_VERSION);
	});

	it('is refused when it is not a sensible list of colours', () => {
		const base = JSON.parse(JSON.stringify(empty()));
		for (const bad of [[], 'red', ['red'], ['#12345'], Array(17).fill('#000000'), [5], null]) {
			expect(() => parseDesign({ ...base, palette: bad }), JSON.stringify(bad)).toThrow(/palette/i);
		}
	});

	it('drops duplicate colours and tidies case', () => {
		const base = JSON.parse(JSON.stringify(empty()));
		expect(parseDesign({ ...base, palette: ['#AABBCC', '#aabbcc', '#112233'] }).palette).toEqual(['#aabbcc', '#112233']);
	});
});
