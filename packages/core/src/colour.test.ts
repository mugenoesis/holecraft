import { describe, expect, it } from 'vitest';
import { FILAMENT_COLOURS, hexToHsv, hsvToHex, hueSatAtWheel, parseHexInput, wheelPointOf } from './colour.ts';
import { isHexColor } from './palette.ts';

describe('hexToHsv and hsvToHex', () => {
	it('reads the primaries, black, white and grey', () => {
		expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
		expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 });
		expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 });
		expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
		expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 });
		expect(hexToHsv('#808080').s).toBe(0);
	});

	it('writes the primaries and mixes', () => {
		expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
		expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe('#ffff00');
		expect(hsvToHex({ h: 180, s: 1, v: 1 })).toBe('#00ffff');
		expect(hsvToHex({ h: 300, s: 1, v: 1 })).toBe('#ff00ff');
		expect(hsvToHex({ h: 0, s: 0, v: 0.5 })).toBe('#808080');
	});

	it('goes there and back for every colour on a coarse grid', () => {
		for (let r = 0; r < 256; r += 17)
			for (let g = 0; g < 256; g += 51)
				for (let b = 0; b < 256; b += 85) {
					const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
					expect(hsvToHex(hexToHsv(hex))).toBe(hex);
				}
	});

	it('keeps a hue in range however it is given', () => {
		expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
		expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe('#0000ff');
		expect(hsvToHex({ h: 0, s: 2, v: -1 })).toBe('#000000');
	});

	it('reads upper-case and gives black for something that is not a colour', () => {
		expect(hexToHsv('#00FF00')).toEqual({ h: 120, s: 1, v: 1 });
		expect(hexToHsv('red')).toEqual({ h: 0, s: 0, v: 0 });
	});
});

describe('the colour wheel', () => {
	// The wheel is drawn by a CSS conic gradient, which starts at the top and turns clockwise; the middle is white.
	it('has red at the top, yellow and green clockwise from it, and white in the middle', () => {
		expect(hueSatAtWheel(0, -1)).toEqual({ h: 0, s: 1 });
		expect(hueSatAtWheel(1, 0).h).toBeCloseTo(90);
		expect(hueSatAtWheel(0, 1).h).toBeCloseTo(180);
		expect(hueSatAtWheel(-1, 0).h).toBeCloseTo(270);
		expect(hueSatAtWheel(0, 0).s).toBe(0);
		expect(hueSatAtWheel(0, -0.5).s).toBeCloseTo(0.5);
	});

	it('keeps a point dragged past the rim on the rim', () => {
		expect(hueSatAtWheel(0, -3)).toEqual({ h: 0, s: 1 });
	});

	it('puts a colour back where it was picked', () => {
		for (const [x, y] of [
			[0.3, -0.4],
			[-0.7, 0.1],
			[0.05, 0.9],
		] as const) {
			const { h, s } = hueSatAtWheel(x, y);
			const p = wheelPointOf(h, s);
			expect(p.x).toBeCloseTo(x);
			expect(p.y).toBeCloseTo(y);
		}
	});
});

describe('the filament colours on offer', () => {
	it('are valid, named and all different', () => {
		expect(FILAMENT_COLOURS.length).toBeGreaterThanOrEqual(16);
		for (const c of FILAMENT_COLOURS) {
			expect(isHexColor(c.hex), c.name).toBe(true);
			expect(c.hex).toBe(c.hex.toLowerCase());
			expect(c.name.length).toBeGreaterThan(0);
		}
		expect(new Set(FILAMENT_COLOURS.map((c) => c.hex)).size).toBe(FILAMENT_COLOURS.length);
		expect(new Set(FILAMENT_COLOURS.map((c) => c.name)).size).toBe(FILAMENT_COLOURS.length);
	});
});

describe('reading a typed colour', () => {
	it('takes #rrggbb in either case, with or without the #, and the short #rgb form', () => {
		expect(parseHexInput('#AbC123')).toBe('#abc123');
		expect(parseHexInput(' abc123 ')).toBe('#abc123');
		expect(parseHexInput('#f80')).toBe('#ff8800');
	});

	it('refuses anything unfinished or not a colour', () => {
		for (const text of ['', '#', '#12', '#12345', '#1234567', 'red', '#ggg000']) expect(parseHexInput(text), text).toBeNull();
	});
});
