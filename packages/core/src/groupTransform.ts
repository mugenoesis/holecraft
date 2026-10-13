import type { Vec3 } from './camera.ts';
import type { Design, DesignNode, Mat4, NodeId } from './design.ts';
import { IDENTITY } from './design.ts';
import { stretchTreatments } from './edgeEdits.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import { rigidInverse, transformPoint } from './mat4.ts';
import { nodeBoundsIn } from './ops.ts';
import type { ShapeGeometry } from './resize.ts';
import { isUpright, type Mat3, multiplyMat3, rotationOfTransform } from './rotation.ts';
import { isThreadedType } from './threadStandards.ts';

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
	const b = groupLocalBounds(design, id);
	return b ? ([0, 1, 2].map((k) => (b.min[k]! + b.max[k]!) / 2) as Vec3) : null;
}

/** The box around a group's contents in the group's own frame (the group's transform taken out), or null. */
export function groupLocalBounds(design: Design, id: NodeId): { min: Vec3; max: Vec3 } | null {
	const node = design.nodes[id];
	if (node?.kind !== 'group') return null;
	const bare = { ...design, nodes: { ...design.nodes, [id]: { ...node, transform: [...IDENTITY], hidden: false } } };
	return nodeBoundsIn(bare, id);
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

/** True when a rotation (row-major 3x3) only swaps and flips axes: every entry is 0 or +-1. */
function isQuarterTurns(r: readonly number[]): boolean {
	return r.every((v) => Math.abs(v) < 1e-6 || Math.abs(Math.abs(v) - 1) < 1e-6);
}

/** Every node inside a group (children, and theirs). */
function innerNodes(design: Design, id: NodeId): DesignNode[] {
	const node = design.nodes[id];
	if (node?.kind !== 'group') return [];
	return node.children.flatMap((c) => {
		const child = design.nodes[c];
		return child ? [child, ...innerNodes(design, c)] : [];
	});
}

/**
 * A group's contents as the box the resize handles work on: base centre in the world, and size along the group's own
 * x, y and z. Null unless the group is only turned about the vertical (the handles work on upright boxes).
 */
export function groupGeometry(design: Design, id: NodeId): ShapeGeometry | null {
	const node = design.nodes[id];
	const b = groupLocalBounds(design, id);
	if (node?.kind !== 'group' || !b || !isUpright(rotationOfTransform(node.transform))) return null;
	const [x, y, z] = transformPoint(node.transform, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.min[2]]);
	return { x, y, z, width: b.max[0] - b.min[0], depth: b.max[1] - b.min[1], height: b.max[2] - b.min[2] };
}

/**
 * Whether a group can be resized exactly. A group has no scale of its own, so resizing rescales every shape inside,
 * which is only exact while each one is turned in quarter turns within its group, and no thread is inside (a thread keeps its real size) (then its width, depth and height
 * line up with the group's axes). The group itself must be upright.
 */
export function canResizeGroup(design: Design, id: NodeId): boolean {
	return (
		groupGeometry(design, id) !== null &&
		innerNodes(design, id).every(
			(n) => isQuarterTurns(rotationOfTransform(n.transform)) && !(n.kind === 'shape' && isThreadedType(n.shapeType)),
		)
	);
}

/** Which of the parent's axes (0, 1, 2) each of a node's own axes lines up with, from a quarter-turn rotation. */
function axisMap(r: readonly number[]): [number, number, number] {
	// column j of the (row-major) matrix is the node's axis j; its non-zero row is the parent axis it lines up with
	return [0, 1, 2].map((j) => [0, 1, 2].find((row) => Math.abs(r[row * 3 + j]!) > 0.5) ?? j) as [number, number, number];
}

const PARAM_AXES = ['width', 'depth', 'height'] as const;
const MIN_PART = 0.1;

/**
 * Maps every node inside a group from the box `from` to the box `to` (both in the group's frame): positions are stretched with the
 * box and shapes are resized along the axes they line up with. Null if any shape would end up too big or too small.
 */
function stretched(
	design: Design,
	id: NodeId,
	from: { min: Vec3; max: Vec3 },
	to: { min: Vec3; max: Vec3 },
): Record<NodeId, DesignNode> | null {
	const f = [0, 1, 2].map((k) => (to.max[k]! - to.min[k]!) / (from.max[k]! - from.min[k]!)) as Vec3;
	const shift = [0, 1, 2].map((k) => to.min[k]! - f[k]! * from.min[k]!) as Vec3;
	const nodes = { ...design.nodes };
	let ok = true;

	const place = (m: Readonly<Mat4>, factors: Vec3, offset: Vec3 | null): Mat4 => {
		const out = [...m];
		for (let k = 0; k < 3; k++) out[12 + k] = factors[k]! * m[12 + k]! + (offset ? offset[k]! : 0);
		return out;
	};

	// `factors` is the stretch along the parent's axes; `offset` is only given for the group's direct children
	const visit = (nodeId: NodeId, factors: Vec3, offset: Vec3 | null) => {
		const node = design.nodes[nodeId];
		if (!node) return;
		const own = axisMap(rotationOfTransform(node.transform)).map((p) => factors[p]!) as Vec3;
		const transform = place(node.transform, factors, offset);
		// chamfers and rounds are stored in the node's own frame, which is stretched by `own`: they move with their edges
		const edges = stretchTreatments(node.edges, own, null);
		if (node.kind === 'group') {
			nodes[nodeId] = { ...node, transform, ...(edges && { edges }) };
			for (const c of node.children) visit(c, own, null);
			return;
		}
		if (node.kind !== 'shape') return;
		const params = { ...node.params } as Record<string, number>;
		PARAM_AXES.forEach((name, i) => {
			const size = (node.params as Record<string, number>)[name]! * own[i]!;
			if (!(size >= MIN_PART && size <= MAX_SHAPE_SIZE)) ok = false;
			params[name] = size;
		});
		nodes[nodeId] = { ...node, transform, params, ...(edges && { edges }) };
	};

	const group = design.nodes[id];
	if (group?.kind !== 'group') return null;
	for (const c of group.children) visit(c, f, shift);
	// the group's own treatments are in the frame its children are placed in, which is stretched by f and moved by shift
	const own = stretchTreatments(group.edges, f, shift);
	if (own) nodes[id] = { ...group, edges: own };
	return ok ? nodes : null;
}

/**
 * Resizes and/or lifts a group to the box `g` (as groupGeometry describes it): everything inside is stretched to match, so the
 * contents fill the new box exactly. Refused (same design back) for a locked group, one that is not upright or has shapes turned
 * other than in quarter turns, bad numbers, a base below the workplane, or a shape that would pass the size limits.
 */
export function setGroupGeometry(design: Design, id: NodeId, g: ShapeGeometry, now?: Date): Design {
	const node = design.nodes[id];
	const from = groupLocalBounds(design, id);
	const sizes = [g.width, g.depth, g.height];
	if (node?.kind !== 'group' || node.locked || !from || !canResizeGroup(design, id)) return design;
	if (![g.x, g.y, g.z, ...sizes].every(Number.isFinite) || g.z < 0 || sizes.some((v) => v <= 0)) return design;

	const [cx, cy, cz] = transformPoint(rigidInverse(node.transform), [g.x, g.y, g.z]);
	const to = { min: [cx - g.width / 2, cy - g.depth / 2, cz] as Vec3, max: [cx + g.width / 2, cy + g.depth / 2, cz + g.height] as Vec3 };
	const nodes = stretched(design, id, from, to);
	if (!nodes) return design;
	const unchanged = [0, 1, 2].every((k) => Math.abs(to.min[k]! - from.min[k]!) < 1e-9 && Math.abs(to.max[k]! - from.max[k]!) < 1e-9);
	return unchanged ? design : { ...design, nodes, updatedAt: stamp(now) };
}
