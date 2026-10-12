import type { Design, NodeId } from './design.ts';
import { duplicateNodes } from './edit.ts';
import { multiplyMat4, rigidInverse } from './mat4.ts';

/**
 * "Duplicate and repeat": `copies` were made from `sources` and then moved, lifted or turned. This
 * copies `copies` again and applies to each new one the same step that took its source to its copy,
 * so pressing Ctrl+D over and over lays out a row, a ring or a staircase. Pairs line up by position
 * in the lists; if either object is missing or the lists differ in length, nothing is made.
 */
export function repeatDuplicate(
	design: Design,
	sources: readonly NodeId[],
	copies: readonly NodeId[],
	now?: Date,
): { design: Design; ids: NodeId[] } {
	const nothing = { design, ids: [] };
	if (copies.length === 0) return nothing;
	if (sources.length !== copies.length || sources.some((id) => !design.nodes[id]) || copies.some((id) => !design.nodes[id])) return nothing;

	const made = duplicateNodes(design, copies, [0, 0], now);
	if (made.ids.length !== copies.length) return nothing;

	const nodes = { ...made.design.nodes };
	made.ids.forEach((id, i) => {
		const copy = design.nodes[copies[i]!]!;
		const step = multiplyMat4(copy.transform, rigidInverse(design.nodes[sources[i]!]!.transform));
		nodes[id] = { ...nodes[id]!, transform: multiplyMat4(step, copy.transform) };
	});
	return { design: { ...made.design, nodes }, ids: made.ids };
}
