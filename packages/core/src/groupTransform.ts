import type { Vec3 } from './camera.ts';
import type { Design, NodeId } from './design.ts';
import { IDENTITY } from './design.ts';
import { transformPoint } from './mat4.ts';
import { nodeBoundsIn } from './ops.ts';
import { type Mat3, multiplyMat3, rotationOfTransform } from './rotation.ts';

/** Turning and sizing whole groups. A group has a position and orientation of its own and no scale of its own. */

/** How far outside the contents the rings sit (mm), as for a single shape. */
const RING_MARGIN = 6;

const stamp = (now?: Date) => (now ?? new Date()).toISOString();

const transpose = (r: readonly number[]): Mat3 => [r[0]!, r[3]!, r[6]!, r[1]!, r[4]!, r[7]!, r[2]!, r[5]!, r[8]!];

/**
 * The middle of what a group holds, in the group's own frame (so it does not move when the group is moved or
 * turned). It is the pivot for turning the group. Null for anything that is not a group, or one with nothing to measure.
 */
export function groupLocalCentre(design: Design, id: NodeId): Vec3 | null {
	const node = design.nodes[id];
	if (node?.kind !== 'group') return null;
	// Measure with the group's own transform taken out and nothing hidden away at the top level.
	const bare = { ...design, nodes: { ...design.nodes, [id]: { ...node, transform: [...IDENTITY], hidden: false } } };
	const b = nodeBoundsIn(bare, id);
	return b ? ([0, 1, 2].map((k) => (b.min[k]! + b.max[k]!) / 2) as Vec3) : null;
}

/**
 * Gives a group the orientation `rotation` (a row-major 3x3), turning it about the middle of its contents so that
 * point stays where it is. The children are untouched: they keep their places inside the group's frame.
 */
export function setGroupRotation(design: Design, id: NodeId, rotation: readonly number[], now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind !== 'group' || node.locked || rotation.length !== 9 || !rotation.every(Number.isFinite)) return design;
	const pivotLocal = groupLocalCentre(design, id);
	if (!pivotLocal) return design;

	const pivot = transformPoint(node.transform, pivotLocal);
	// How far the world turns: the new orientation after undoing the old one.
	const delta = multiplyMat3(rotation, transpose(rotationOfTransform(node.transform)));
	const from: Vec3 = [node.transform[12]! - pivot[0], node.transform[13]! - pivot[1], node.transform[14]! - pivot[2]];
	const moved = [0, 1, 2].map((r) => pivot[r]! + delta[r * 3]! * from[0] + delta[r * 3 + 1]! * from[1] + delta[r * 3 + 2]! * from[2]);

	const transform = [
		rotation[0]!,
		rotation[3]!,
		rotation[6]!,
		0,
		rotation[1]!,
		rotation[4]!,
		rotation[7]!,
		0,
		rotation[2]!,
		rotation[5]!,
		rotation[8]!,
		0,
		moved[0]!,
		moved[1]!,
		moved[2]!,
		1,
	];
	if (transform.every((v, i) => Math.abs(v - node.transform[i]!) < 1e-9)) return design;
	return { ...design, nodes: { ...design.nodes, [id]: { ...node, transform } }, updatedAt: stamp(now) };
}

/** Where a group's rotation rings go: the middle of its contents in the world, a radius just outside them, and its orientation. */
export function groupRings(design: Design, id: NodeId): { center: Vec3; radius: number; rotation: Mat3 } | null {
	const node = design.nodes[id];
	const local = groupLocalCentre(design, id);
	if (node?.kind !== 'group' || !local) return null;
	// Half the diagonal of the contents' bounds in the group's own frame, whatever way the group is turned.
	const bare = { ...design, nodes: { ...design.nodes, [id]: { ...node, transform: [...IDENTITY], hidden: false } } };
	const b = nodeBoundsIn(bare, id)!;
	const radius = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2 + RING_MARGIN;
	return { center: transformPoint(node.transform, local), radius, rotation: rotationOfTransform(node.transform) };
}
