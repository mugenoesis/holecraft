import { isHexColor } from './palette.ts';

/** A colour as hue (degrees, 0 up to 360), saturation and value (brightness), both 0 to 1: how the colour wheel thinks. */
export interface Hsv {
	h: number;
	s: number;
	v: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const byte = (n: number) => Math.round(clamp01(n) * 255);

/** Reads `#rrggbb` as hue, saturation and value. Anything else reads as black. A grey has hue 0. */
export function hexToHsv(hex: string): Hsv {
	if (!isHexColor(hex)) return { h: 0, s: 0, v: 0 };
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
	const max = Math.max(r, g, b);
	const span = max - Math.min(r, g, b);
	let h = 0;
	if (span > 0) {
		if (max === r) h = ((g - b) / span) % 6;
		else if (max === g) h = (b - r) / span + 2;
		else h = (r - g) / span + 4;
	}
	return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : span / max, v: max };
}

/** Writes hue, saturation and value as `#rrggbb`. The hue wraps round; saturation and value are kept within 0 to 1. */
export function hsvToHex({ h, s, v }: Hsv): string {
	const hue = (((h % 360) + 360) % 360) / 60;
	const value = clamp01(v);
	const chroma = value * clamp01(s);
	const x = chroma * (1 - Math.abs((hue % 2) - 1));
	const sector = Math.floor(hue);
	const [r, g, b] = [
		[chroma, x, 0],
		[x, chroma, 0],
		[0, chroma, x],
		[0, x, chroma],
		[x, 0, chroma],
		[chroma, 0, x],
	][sector] ?? [0, 0, 0];
	const m = value - chroma;
	return `#${[r! + m, g! + m, b! + m].map((c) => byte(c).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The hue and saturation under a point of the colour wheel, with the wheel's middle at (0, 0) and its rim at
 * distance 1, y pointing down the screen. Red is at the top and the hues turn clockwise (as a CSS conic gradient
 * draws them); the middle is white. A point past the rim counts as on the rim, so a drag can overshoot.
 */
export function hueSatAtWheel(x: number, y: number): { h: number; s: number } {
	const s = Math.min(1, Math.hypot(x, y));
	const h = s === 0 ? 0 : ((((Math.atan2(x, -y) * 180) / Math.PI) % 360) + 360) % 360;
	return { h, s };
}

/** Where on the colour wheel a hue and saturation sit: the inverse of `hueSatAtWheel`. */
export function wheelPointOf(h: number, s: number): { x: number; y: number } {
	const a = (h * Math.PI) / 180;
	return { x: Math.sin(a) * s, y: -Math.cos(a) * s };
}

/** Ready-made colours offered next to the wheel: the colours filament usually comes in, so a print can match the screen. */
export const FILAMENT_COLOURS: ReadonlyArray<{ name: string; hex: string }> = Object.freeze([
	{ name: 'White', hex: '#f4f4f1' },
	{ name: 'Light grey', hex: '#c4c7c9' },
	{ name: 'Grey', hex: '#8a8d8f' },
	{ name: 'Dark grey', hex: '#4b4f54' },
	{ name: 'Black', hex: '#1c1c1e' },
	{ name: 'Red', hex: '#d32f2f' },
	{ name: 'Dark red', hex: '#8e1b1b' },
	{ name: 'Orange', hex: '#f57c00' },
	{ name: 'Yellow', hex: '#fbc02d' },
	{ name: 'Lime', hex: '#9ccc3c' },
	{ name: 'Green', hex: '#2e9e4f' },
	{ name: 'Dark green', hex: '#1f5e3a' },
	{ name: 'Teal', hex: '#00897b' },
	{ name: 'Cyan', hex: '#26c6da' },
	{ name: 'Sky blue', hex: '#64b5f6' },
	{ name: 'Blue', hex: '#1e63c4' },
	{ name: 'Navy', hex: '#1a2a5c' },
	{ name: 'Purple', hex: '#7b3fa8' },
	{ name: 'Magenta', hex: '#d81b8c' },
	{ name: 'Pink', hex: '#f48fb1' },
	{ name: 'Beige', hex: '#e3cfa4' },
	{ name: 'Brown', hex: '#7a4a2a' },
	{ name: 'Gold', hex: '#c9a227' },
	{ name: 'Silver', hex: '#a8adb3' },
]);

/** A colour as typed: `#rrggbb` or `#rgb`, either case, the `#` optional. Gives `#rrggbb` in lower case, or null if it is not one (yet). */
export function parseHexInput(text: string): string | null {
	const digits = text.trim().replace(/^#/, '').toLowerCase();
	if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`;
	if (/^[0-9a-f]{3}$/.test(digits)) return `#${[...digits].map((d) => d + d).join('')}`;
	return null;
}
