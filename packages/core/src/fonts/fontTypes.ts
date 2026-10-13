/** One letter of a bundled font, in the font's own units (y up). */
export interface FontGlyph {
	/** How far the pen moves on after it. */
	advance: number;
	/** Its ink: x min, y min, x max, y max (all zero for a space). */
	box: [number, number, number, number];
	/** Its outline as path text: absolute M, L, Q, C and Z commands, no separators other than the minus signs and spaces between numbers. */
	path: string;
}

export interface FontData {
	id: number;
	label: string;
	unitsPerEm: number;
	ascender: number;
	descender: number;
	/** By code point: Basic Latin and Latin-1. */
	glyphs: Record<number, FontGlyph>;
}
