import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import { isFontId, TEXT_MAX_LENGTH, textMetrics } from './text.ts';

/**
 * The Text shape's own rules: it keeps its words in `params.text` and its font in `params.font` (an id from `FONTS`), and is as big as its box says
 * (the outline of the words is stretched to fill width x depth, then extruded height thick). Changing the words or the font gives it the size of
 * the new letters, at the same em (the same letter size in mm) as it had.
 */

/** The size of a new text's letters, in mm to the em (a 10 mm em has capitals about 7 mm high). */
export const DEFAULT_EM_MM = 10;
export const DEFAULT_TEXT = 'Text';
export const DEFAULT_FONT = 1;
/** How thick a new text is, in mm. */
export const DEFAULT_TEXT_HEIGHT = 3;

/** The size [width, depth, height] of a new text. */
export function defaultTextSize(): [number, number, number] {
	const m = textMetrics(DEFAULT_TEXT, DEFAULT_FONT)!;
	return [m.width * DEFAULT_EM_MM, m.depth * DEFAULT_EM_MM, DEFAULT_TEXT_HEIGHT];
}

/** A text shape's words (Text if they are missing, as in a damaged file). */
export function textOf(node: Pick<ShapeNode, 'params'>): string {
	const { text } = node.params;
	return typeof text === 'string' && text.length > 0 ? text : DEFAULT_TEXT;
}

/** A text shape's font id (Sans if it is missing or unknown). */
export function fontOf(node: Pick<ShapeNode, 'params'>): number {
	const font = Number(node.params.font);
	return isFontId(font) ? font : DEFAULT_FONT;
}

/** How many mm to the em the shape's letters are now: its depth over the depth of its words in ems. */
function emMm(params: ShapeNode['params'], text: string, font: number): number {
	const m = textMetrics(text, font);
	const depth = Number(params.depth);
	return m && depth > 0 ? depth / m.depth : DEFAULT_EM_MM;
}

/**
 * `before` with its words and font replaced by `text` and `font`, and the width and depth those letters have at the em it had. Null if the words
 * have no ink in this font or the letters would be bigger than a shape may be. Used by the Text shape's own edits and by Font changes.
 */
export function withText(before: ShapeNode['params'], text: string, font: number): ShapeNode['params'] | null {
	const [oldText, oldFont] = [typeof before.text === 'string' ? before.text : DEFAULT_TEXT, Number(before.font) || DEFAULT_FONT];
	const next = textMetrics(text, font);
	if (!next) return null;
	const em = emMm(before, oldText, oldFont);
	const [width, depth] = [next.width * em, next.depth * em];
	if (!(width > 0 && width <= MAX_SHAPE_SIZE && depth > 0 && depth <= MAX_SHAPE_SIZE)) return null;
	return { ...before, text, font, width, depth };
}

/**
 * Sets a text shape's words. Cut off at 100 characters. Refused (the same design back) for a shape that is not text or is locked, words with no
 * ink in its font (nothing, spaces, letters the font has not got), the same words, or letters that would be too big.
 */
export function setShapeText(design: Design, id: NodeId, text: string, now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'shape' || node.shapeType !== 'text' || node.locked) return design;
	const words = text.slice(0, TEXT_MAX_LENGTH);
	if (words === textOf(node)) return design;
	const params = withText(node.params, words, fontOf(node));
	if (!params) return design;
	return { ...design, nodes: { ...design.nodes, [id]: { ...node, params } }, updatedAt: (now ?? new Date()).toISOString() };
}
