import { SHAPE_DEFS, type ShapeCategory, type ShapeDef } from './shapes.ts';

/** The groups of the Shapes panel (its chips), in order. */
export const SHAPE_CATEGORIES: readonly { id: ShapeCategory; label: string }[] = [
	{ id: 'basic', label: 'Basic' },
	{ id: 'parametric', label: 'Parametric' },
	{ id: 'fasteners', label: 'Fasteners' },
];

const words = (text: string): string[] =>
	text
		.toLowerCase()
		.split(/[\s-]+/)
		.filter(Boolean);

/** How well one word of a search matches a shape: 0 the name starts with it, 1 a word of the name does, 2 the name has it inside, 3 a word of another name it goes by starts with it, or null. */
function rank(def: ShapeDef, word: string): number | null {
	const name = def.name.toLowerCase();
	if (name.startsWith(word)) return 0;
	if (words(def.name).some((w) => w.startsWith(word))) return 1;
	if (name.includes(word)) return 2;
	return def.keywords.some((k) => words(k).some((w) => w.startsWith(word))) ? 3 : null;
}

/**
 * The shapes the Shapes panel shows for a search and a category (\`all\` for every one). Every word of the search must match the shape's name or
 * another name it goes by (\`keywords\`). Best matches come first (the name starting with the search, then a word of it, then anywhere in it, then
 * its other names), and shapes that match equally well stay in the panel's order. No search gives them all, in order.
 */
export function filterShapes(query: string, category: ShapeCategory | 'all'): ShapeDef[] {
	const wanted = words(query);
	const scored = SHAPE_DEFS.flatMap((def, order) => {
		if (category !== 'all' && def.category !== category) return [];
		const ranks = wanted.map((w) => rank(def, w));
		if (ranks.some((r) => r === null)) return [];
		return [{ def, order, score: Math.max(0, ...(ranks as number[])) }];
	});
	return scored.sort((a, b) => a.score - b.score || a.order - b.order).map((s) => s.def);
}
