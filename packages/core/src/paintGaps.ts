import { type Surface, sharedEdgeLength, triangleArea } from './paintSurface.ts';

/**
 * Gap fill, as in OrcaSlicer: after painting, small patches are left over (a speck of paint, a sliver the brush missed). A patch is a
 * connected set of triangles of one colour (or none); one smaller than `area` mm2 that touches another colour is given that colour.
 * It joins the neighbour it shares the most edge with, never another small patch (two specks would only swap), and every patch is
 * judged on the paint as it was at the start of each pass, and passes go on until nothing joins (a speck inside a small ring joins the
 * surface once the ring has).
 *
 * `owner[t]` is which fill shows on triangle t (-1 for none) and `colourOf` what that means, so the same colour from two fills is one patch.
 */
/** The connected patches of one colour (triangle lists), and which patch each triangle is in (-1 for a degenerate one). */
function patchesOf(surface: Surface, colourOf: (t: number) => string | null): { patches: number[][]; patchOf: Int32Array } {
	const patchOf = new Int32Array(surface.corners.length).fill(-1);
	const patches: number[][] = [];
	for (let start = 0; start < patchOf.length; start++) {
		if (patchOf[start]! >= 0 || !surface.normals[start]) continue;
		const members = [start];
		patchOf[start] = patches.length;
		for (let head = 0; head < members.length; head++) {
			for (const next of surface.neighbours[members[head]!]!) {
				if (patchOf[next]! >= 0 || colourOf(next) !== colourOf(start)) continue;
				patchOf[next] = patches.length;
				members.push(next);
			}
		}
		patches.push(members);
	}
	return { patches, patchOf };
}

/** The big patch a small one shares the most edge with (the lower numbered on a tie), or null if it touches none. */
function bestNeighbour(surface: Surface, members: number[], p: number, patchOf: Int32Array, small: boolean[]): number | null {
	const along = new Map<number, number>(); // neighbouring patch -> length of shared edge
	for (const t of members) {
		for (const next of surface.neighbours[t]!) {
			const q = patchOf[next]!;
			if (q !== p && !small[q]!) along.set(q, (along.get(q) ?? 0) + sharedEdgeLength(surface, t, next));
		}
	}
	return [...along].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? null;
}

/** One pass: every small patch that touches a big one joins it. True if anything changed. */
function mergePass(surface: Surface, owner: Int32Array, colourOf: (t: number) => string | null, area: number): boolean {
	const { patches, patchOf } = patchesOf(surface, colourOf);
	const small = patches.map((members) => members.reduce((sum, t) => sum + triangleArea(surface, t), 0) < area);
	const merges: [number[], number][] = [];
	patches.forEach((members, p) => {
		const to = small[p] ? bestNeighbour(surface, members, p, patchOf, small) : null;
		if (to !== null) merges.push([members, owner[patches[to]![0]!]!]);
	});
	for (const [members, to] of merges) for (const t of members) owner[t] = to;
	return merges.length > 0;
}

/** Passes it may take: a speck inside a small ring joins the surface only once the ring has. */
const MAX_PASSES = 8;

export function mergeGaps(surface: Surface, owner: Int32Array, colourOf: (t: number) => string | null, area: number): void {
	for (let pass = 0; pass < MAX_PASSES && mergePass(surface, owner, colourOf, area); pass++);
}
