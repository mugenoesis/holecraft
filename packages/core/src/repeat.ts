import type { Design, Mat4, NodeId } from './design.ts';
import { duplicateNodes } from './edit.ts';
import { multiplyMat4 } from './mat4.ts';

/** Inverse of a rotation + translation matrix (transforms here never scale). */
function rigidInverse(m: Readonly<Mat4>): Mat4 {
	const r = (row: number, col: number) => m[col * 4 + row]!; // the transpose of the rotation
	const t = [m[12]!, m[13]!, m[14]!];
	const out: Mat4 = new Array<number>(16).fill(0);
	for (let col = 0; col < 3; col++) {
		for (let row = 0; row < 3; row++) out[col * 4 + row] = r(col, row);
		out[12 + col] = -(out[col]! * t[0]! + out[4 + col]! * t[1]! + out[8 + col]! * t[2]!);
	}
	out[15] = 1;
	return out;
}

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
