import { FONT_LIST, FONT_LOADERS } from './fonts/fontIndex.generated.ts';
import type { FontData } from './fonts/fontTypes.ts';
import { FONT as DEFAULT_FONT_DATA } from './fonts/outlines/sans.generated.ts';

/**
 * Text as a shape: the letters of ten bundled open fonts (their outlines are built into the app, so there is nothing to fetch from anywhere else
 * and it works offline), laid out in a line and handed on as flat outlines for the geometry engine to extrude. Everything here is plain maths on
 * numbers, in ems (1 = the font's size), so it can be tested without a browser and runs on both the page and the worker.
 *
 * Each font's outlines are their own file, loaded the first time a design needs them (`loadFont`): the default, Sans, is part of the code, so a
 * design with no text, or only Sans, loads nothing more. A font that has not loaded gives no letters (`textMetrics` and `textOutlines` are null),
 * so whatever is about to use one first awaits `loadFonts(fontsUsedBy(...))`.
 */

/** The fonts, in the order the Font choice lists them (names only: no outlines are loaded to show the list). `id` is what a design stores, so it never changes. */
export const FONTS: readonly { id: number; label: string }[] = [...FONT_LIST].sort((a, b) => a.id - b.id);

const LOADED = new Map<number, FontData>([[DEFAULT_FONT_DATA.id, DEFAULT_FONT_DATA]]);
const LOADING = new Map<number, Promise<boolean>>();

/** True if this is the id of a font (loaded or not). */
export const isFontId = (id: number): boolean => Number.isInteger(id) && id in FONT_LOADERS;

/** A font's data by its id, or undefined if there is no such font or it has not been loaded. */
export const fontById = (id: number): FontData | undefined => LOADED.get(id);

/** True once a font's outlines are loaded. */
export const fontLoaded = (id: number): boolean => LOADED.has(id);

/** Loads a font's outlines (once, however many ask). True when the font is ready, false for an id that is not a font or a file that would not load. */
export function loadFont(id: number): Promise<boolean> {
	if (LOADED.has(id)) return Promise.resolve(true);
	if (!isFontId(id)) return Promise.resolve(false);
	let loading = LOADING.get(id);
	if (!loading) {
		loading = FONT_LOADERS[id]!()
			.then((font) => {
				LOADED.set(id, font);
				return true;
			})
			.catch(() => false)
			.finally(() => LOADING.delete(id));
		LOADING.set(id, loading);
	}
	return loading;
}

/** Loads several fonts at once (ids that are not fonts are ignored). */
export async function loadFonts(ids: Iterable<number>): Promise<void> {
	await Promise.all([...new Set(ids)].map(loadFont));
}

/** The most letters a text shape has: more is cut off. */
export const TEXT_MAX_LENGTH = 100;

interface Placed {
	codePoint: number;
	/** Where the letter starts along the line, in font units. */
	x: number;
}

/** The letters of a text that the font has, with where each goes, and how many it has not got. A line break counts as a space. */
function layout(text: string, font: FontData): { placed: Placed[]; unsupported: number } {
	const placed: Placed[] = [];
	let x = 0;
	let unsupported = 0;
	for (const ch of Array.from(text).slice(0, TEXT_MAX_LENGTH)) {
		const glyph = font.glyphs[(ch === '\n' || ch === '\t' ? ' ' : ch).codePointAt(0)!];
		if (!glyph) {
			unsupported++;
			continue;
		}
		placed.push({ codePoint: (ch === '\n' || ch === '\t' ? ' ' : ch).codePointAt(0)!, x });
		x += glyph.advance;
	}
	return { placed, unsupported };
}

/** The ink of a text in ems (width along the line, depth up and down), and how many letters could not be drawn. Null if there is no ink at all. */
export function textMetrics(text: string, fontId: number): { width: number; depth: number; unsupported: number } | null {
	const font = fontById(fontId);
	if (!font) return null;
	const { placed, unsupported } = layout(text, font);
	let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const { codePoint, x } of placed) {
		const [bx0, by0, bx1, by1] = font.glyphs[codePoint]!.box;
		if (bx1 === bx0 && by1 === by0) continue; // a space
		[x0, y0, x1, y1] = [Math.min(x0, x + bx0), Math.min(y0, by0), Math.max(x1, x + bx1), Math.max(y1, by1)];
	}
	if (x0 === Infinity) return null;
	return { width: (x1 - x0) / font.unitsPerEm, depth: (y1 - y0) / font.unitsPerEm, unsupported };
}

type Point = [number, number];

/** Points a curve is cut into per em of its control polygon (a 10 mm letter then has pieces well under a tenth of a millimetre long). */
const PIECES_PER_EM = 60;
const MIN_PIECES = 4;
const MAX_PIECES = 24;

/** The points along a quadratic or cubic curve (its control points, the first being the start), not counting the start. */
function curvePoints(pts: readonly Point[]): Point[] {
	const length = pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);
	const pieces = Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.ceil(length * PIECES_PER_EM)));
	return Array.from({ length: pieces }, (_, k) => bezier(pts, (k + 1) / pieces));
}

/** A glyph's outline text as closed polygons in font units, moved along by `dx`. */
function contours(path: string, dx: number): Point[][] {
	const out: Point[][] = [];
	let current: Point[] = [];
	let at: Point = [0, 0];
	const finish = () => {
		if (current.length > 2) out.push(current);
		current = [];
	};
	for (const part of path.match(/[MLQCZ][^MLQCZ]*/g) ?? []) {
		const n = (part.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
		const points = Array.from({ length: n.length / 2 }, (_, i): Point => [n[2 * i]! + dx, n[2 * i + 1]!]);
		if (part[0] === 'M') {
			finish();
			at = points[0]!;
			current = [at];
		} else if (part[0] === 'L') {
			at = points[0]!;
			current.push(at);
		} else if (part[0] !== 'Z') {
			current.push(...curvePoints([at, ...points]));
			at = points[points.length - 1]!;
		}
	}
	finish();
	return out;
}

/** A point of a quadratic or cubic Bezier curve (given its control points, the first being the start) at t from 0 to 1. */
function bezier(p: readonly Point[], t: number): Point {
	const u = 1 - t;
	if (p.length === 3)
		return [u * u * p[0]![0] + 2 * u * t * p[1]![0] + t * t * p[2]![0], u * u * p[0]![1] + 2 * u * t * p[1]![1] + t * t * p[2]![1]];
	return [
		u * u * u * p[0]![0] + 3 * u * u * t * p[1]![0] + 3 * u * t * t * p[2]![0] + t * t * t * p[3]![0],
		u * u * u * p[0]![1] + 3 * u * u * t * p[1]![1] + 3 * u * t * t * p[2]![1] + t * t * t * p[3]![1],
	];
}

/**
 * The outline of a text as closed polygons in ems with y up, one per contour (a letter with a hole has two, wound the other way round, so filling
 * by winding leaves the hole), and the box they fill. Null if there is no ink. Spaces and letters the font has not got are left out.
 */
export function textOutlines(text: string, fontId: number): { polygons: Point[][]; box: { min: Point; max: Point } } | null {
	const font = fontById(fontId);
	if (!font || !textMetrics(text, fontId)) return null;
	const polygons: Point[][] = [];
	for (const { codePoint, x } of layout(text, font).placed) {
		for (const c of contours(font.glyphs[codePoint]!.path, x))
			polygons.push(c.map(([px, py]): Point => [px / font.unitsPerEm, py / font.unitsPerEm]));
	}
	const all = polygons.flat();
	const xs = all.map((p) => p[0]);
	const ys = all.map((p) => p[1]);
	return { polygons, box: { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] } };
}
