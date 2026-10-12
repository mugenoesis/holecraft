import type { Bounds, Vec3 } from './camera.ts';
import type { Design, DesignNode, Mat4, NodeId } from './design.ts';
import { descendantIds } from './groups.ts';
import { multiplyMat4 } from './mat4.ts';
import { MESH_SHAPE_TYPE } from './meshShape.ts';
import { nodeBoundsIn } from './ops.ts';
import type { Axis } from './rotation.ts';

/** Arranging several objects relative to each other: align their edges or centres, or mirror them. */

export type AlignEdge = 'min' | 'centre' | 'max';

const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };
const EPSILON = 1e-9;

const isEditable = (n: DesignNode | undefined): n is DesignNode => !!n && !n.locked;
const stamp = (now?: Date) => (now ?? new Date()).toISOString();

/** Whether Align can do anything: two or more objects that are not all locked or hidden. */
export function canAlign(design: Design, ids: readonly NodeId[]): boolean {
	return ids.length >= 2 && ids.some((id) => isEditable(design.nodes[id]) && nodeBoundsIn(design, id) !== null);
}

/** The coordinate on `axis` that `edge` of the bounds sits at. */
function edgeOf(b: Bounds, axis: number, edge: AlignEdge): number {
	if (edge === 'min') return b.min[axis]!;
	if (edge === 'max') return b.max[axis]!;
	return (b.min[axis]! + b.max[axis]!) / 2;
}

/** Bounds of everything the given top-level nodes hold; hidden and empty ones are left out. */
function selectionBounds(design: Design, ids: readonly NodeId[]): Bounds | null {
	const all = ids.map((id) => nodeBoundsIn(design, id)).filter((b): b is Bounds => b !== null);
	if (all.length === 0) return null;
	const pick = (f: (...v: number[]) => number, key: 'min' | 'max') => [0, 1, 2].map((k) => f(...all.map((b) => b[key][k]!))) as Vec3;
	return { min: pick(Math.min, 'min'), max: pick(Math.max, 'max') };
}

/**
 * Lines the selected objects up on one axis: their lowest edges, their middles, or their highest
 * edges all meet at the place the whole selection reaches. Only that axis changes. Needs at least
 * two objects; locked and hidden ones stay where they are (but still count towards the target).
 */
export function alignNodes(design: Design, ids: readonly NodeId[], axis: Axis, edge: AlignEdge, now?: Date): Design {
	const k = AXIS_INDEX[axis];
	const all = selectionBounds(design, ids);
	if (!all || ids.length < 2) return design;
	const target = edgeOf(all, k, edge);

	const nodes = { ...design.nodes };
	let changed = false;
	for (const id of ids) {
		const node = nodes[id];
		const b = nodeBoundsIn(design, id);
		if (!(isEditable(node) && b)) continue;
		const delta = target - edgeOf(b, k, edge);
		if (Math.abs(delta) < EPSILON) continue;
		const transform = [...node.transform];
		transform[12 + k] = transform[12 + k]! + delta;
		nodes[id] = { ...node, transform };
		changed = true;
	}
	return changed ? { ...design, nodes, updatedAt: stamp(now) } : design;
}

/** The mirror image of a local frame: x turned the other way. Applying it twice changes nothing. */
const FLIP_X: Mat4 = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A reflection through the plane `axis = at`, as a transform. */
function reflection(axis: Axis, at: number): Mat4 {
	const m: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
	const k = AXIS_INDEX[axis];
	m[k * 5] = -1;
	m[12 + k] = 2 * at;
	return m;
}

const hasImportedModel = (design: Design, id: NodeId): boolean =>
	[id, ...descendantIds(design, id)].some((n) => {
		const node = design.nodes[n];
		return node?.kind === 'shape' && node.shapeType === MESH_SHAPE_TYPE;
	});

/** Whether Flip can do anything: something unlocked is selected and none of it is an imported model. */
export function canFlip(design: Design, ids: readonly NodeId[]): boolean {
	return ids.some((id) => isEditable(design.nodes[id])) && !ids.some((id) => hasImportedModel(design, id));
}

/**
 * Mirrors the selection through a plane across `axis`, placed in the middle of everything
 * selected (so one object flips in place, and several swap sides). Everything still ends up with a
 * proper rotation, never a negative scale: each node's own frame is turned round x as well, which
 * is invisible because every shape is symmetric about its own x. Imported models are not, so a
 * selection holding one is left alone. Locked objects stay put.
 */
export function flipNodes(design: Design, ids: readonly NodeId[], axis: Axis, now?: Date): Design {
	const roots = ids.filter((id) => isEditable(design.nodes[id]));
	const all = selectionBounds(design, ids);
	if (roots.length === 0 || !all || ids.some((id) => hasImportedModel(design, id))) return design;
	const mirror = reflection(axis, edgeOf(all, AXIS_INDEX[axis], 'centre'));

	const nodes = { ...design.nodes };
	// L' = reflection-in-parent-frame · L · FLIP_X, and the children of a flipped group are unflipped by the group's frame
	const redo = (id: NodeId, parentFlip: Mat4) => {
		const node = nodes[id];
		if (!node) return;
		nodes[id] = { ...node, transform: multiplyMat4(multiplyMat4(parentFlip, node.transform), FLIP_X) };
		if (node.kind === 'group') for (const child of node.children) redo(child, FLIP_X);
	};
	for (const id of roots) redo(id, mirror);
	return { ...design, nodes, updatedAt: stamp(now) };
}
