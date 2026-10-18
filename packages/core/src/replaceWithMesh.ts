import type { Design, NodeId, ShapeNode } from './design.ts';
import { deleteNodes } from './edit.ts';
import { addMeshShape, type MeshShapeInput } from './meshShape.ts';
import { nodeBoundsIn, translation } from './ops.ts';

/**
 * Swaps a shape or group for an imported mesh shape that occupies the same space, as one edit: what Hollow does with the hollow model
 * the slicer sends back (which is in the world, where the original was). The new shape takes the old one's place in the list and its colour.
 */

/** Whether there is a visible, unlocked top-level shape or group with this id to swap. */
export function canReplaceWithMesh(design: Design, id: NodeId): boolean {
	const node = design.nodes[id];
	return !!node && design.roots.includes(id) && !node.locked && !node.hidden && nodeBoundsIn(design, id) !== null;
}

/**
 * The mesh `input` (its size is the size of the box it fills) stands where `id` was: its base at the lowest point of what it replaces and
 * its middle over the middle of it. The original, and anything inside it, is removed.
 */
export function replaceWithMesh(
	design: Design,
	id: NodeId,
	input: MeshShapeInput,
	opts: { id?: NodeId; now?: Date } = {},
): { design: Design; id: NodeId } {
	if (!canReplaceWithMesh(design, id)) return { design, id };
	const old = design.nodes[id]!;
	const b = nodeBoundsIn(design, id)!;
	const at = (opts.id ? { id: opts.id } : {}) as { id?: NodeId };
	const added = addMeshShape(design, input, {
		at: [(b.min[0]! + b.max[0]!) / 2, (b.min[1]! + b.max[1]!) / 2],
		...at,
		...(opts.now ? { now: opts.now } : {}),
	});
	const shape = added.design.nodes[added.id] as ShapeNode;
	const placed: ShapeNode = { ...shape, color: old.color, transform: translation(shape.transform[12]!, shape.transform[13]!, b.min[2]!) };
	const withNew: Design = { ...added.design, nodes: { ...added.design.nodes, [added.id]: placed } };

	const index = design.roots.indexOf(id);
	const without = deleteNodes(withNew, [id], opts.now);
	const roots = without.roots.filter((r) => r !== added.id);
	roots.splice(index, 0, added.id);
	return { design: { ...without, roots }, id: added.id };
}
