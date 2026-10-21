import type { MeshHealth, MeshRepairResult } from '@holecraft/core';

/* The words of the Model check panel: what is wrong with an imported model, and what a repair did. */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The panel's lines for a model: one line when it is a closed surface, else one for each fault. */
export function describeHealth(h: MeshHealth): string[] {
	if (h.closed) return [`Closed surface (${plural(h.triangles, 'triangle', 'triangles')})`];
	const lines: string[] = [];
	if (h.openEdges > 0)
		lines.push(`${plural(h.openEdges, 'open edge', 'open edges')}: ${h.openEdges === 1 ? 'a hole' : 'holes'} in the surface`);
	if (h.flippedEdges > 0) lines.push(`${plural(h.flippedEdges, 'edge', 'edges')} where neighbouring triangles face opposite ways`);
	if (h.degenerate > 0) lines.push(`${plural(h.degenerate, 'triangle', 'triangles')} with no area`);
	if (h.insideOut > 0) lines.push('The surface faces inwards (inside out)');
	if (h.nonManifoldEdges > 0) {
		lines.push(`${plural(h.nonManifoldEdges, 'edge', 'edges')} shared by three or more triangles (cannot be mended automatically)`);
	}
	return lines;
}

/** Whether a repair can do anything for this model (an edge three triangles share, alone, it cannot). */
export const canRepair = (h: MeshHealth): boolean => h.openEdges > 0 || h.flippedEdges > 0 || h.degenerate > 0 || h.insideOut > 0;

/** What a repair did, in a sentence, and what it could not do. */
export function repairNote({ fixed, health }: Pick<MeshRepairResult, 'fixed' | 'health'>): string {
	const done: string[] = [];
	if (fixed.holesFilled > 0) done.push(`filled ${plural(fixed.holesFilled, 'hole', 'holes')}`);
	if (fixed.flippedFaces > 0) done.push(`turned ${plural(fixed.flippedFaces, 'triangle', 'triangles')} round`);
	if (fixed.degenerateRemoved > 0) done.push(`removed ${plural(fixed.degenerateRemoved, 'triangle', 'triangles')} with no area`);
	const sentences: string[] = [];
	if (done.length > 0) sentences.push(`Repaired: ${done.join(', ')}.`);
	if (fixed.holesLeft > 0) sentences.push(`${plural(fixed.holesLeft, 'hole', 'holes')} could not be filled.`);
	if (sentences.length === 0) return health.closed ? 'Nothing needed mending.' : 'Nothing here can be mended automatically.';
	return sentences.join(' ');
}
