import type { Design, NodeId } from './design.ts';
import { groupNodes } from './groups.ts';
import type { MeshShapeInput } from './meshShape.ts';
import { nodeBoundsIn } from './ops.ts';
import { replaceWithMesh } from './replaceWithMesh.ts';

/*
 * Merge: the selected shapes (or one group) become one solid, as one edit. What the shapes make together (their solids joined, any hole in the
 * selection cut out) is worked out by the geometry engine and comes back as a mesh, which takes the place of the shapes the way Hollow's result
 * does. It is an imported-model shape from then on: it moves, turns, resizes, groups and exports like one, but its parts can no longer be edited.
 * These are the rules around that, pure.
 */

const ASK = 'Select two or more shapes (or one group) to merge them into one solid.';

/** The selected top-level nodes, in list order. */
const membersOf = (design: Design, ids: readonly NodeId[]): NodeId[] => {
	const wanted = new Set(ids);
	return design.roots.filter((id) => wanted.has(id));
};

/** Why the selection cannot be merged, in words for the button, or null when it can. */
export function whyNotMerge(design: Design, ids: readonly NodeId[]): string | null {
	const members = membersOf(design, ids);
	const only = members.length === 1 ? design.nodes[members[0]!] : undefined;
	if (members.length < 2 && only?.kind !== 'group') return ASK;
	for (const id of members) {
		const node = design.nodes[id]!;
		if (node.locked) return `${node.name} is locked: unlock it in the Objects list to merge it.`;
		if (node.hidden) return `${node.name} is hidden: show it in the Objects list to merge it.`;
		if (nodeBoundsIn(design, id) === null) return `${node.name} has nothing in it to merge.`;
	}
	if (members.every((id) => design.nodes[id]!.mode === 'hole')) return 'Merging needs at least one solid: everything selected is a hole.';
	return null;
}

export const canMerge = (design: Design, ids: readonly NodeId[]): boolean => whyNotMerge(design, ids) === null;

/**
 * The selected shapes joined into one group, which is what the engine works out the merged solid from (a hole among them cuts, as in any
 * group). With one group selected, that group. The design is changed only by the group; `id` is null when the selection cannot be merged.
 */
export function groupToMerge(
	design: Design,
	ids: readonly NodeId[],
	opts: { groupId?: NodeId; now?: Date } = {},
): { design: Design; id: NodeId | null } {
	if (!canMerge(design, ids)) return { design, id: null };
	const members = membersOf(design, ids);
	if (members.length === 1) return { design, id: members[0]! };
	return groupNodes(design, members, { ...(opts.groupId ? { id: opts.groupId } : {}), ...(opts.now ? { now: opts.now } : {}) });
}

/**
 * Replaces the selected shapes by the mesh `input` (the merged solid, whose size is the box it fills), standing where they were and taking
 * the place of the first of them in the list. The same design comes back, with a null `id`, if the selection cannot be merged.
 */
export function mergeShapes(
	design: Design,
	ids: readonly NodeId[],
	input: MeshShapeInput,
	opts: { id?: NodeId; groupId?: NodeId; now?: Date } = {},
): { design: Design; id: NodeId | null } {
	const grouped = groupToMerge(design, ids, opts);
	if (grouped.id === null) return { design, id: null };
	return replaceWithMesh(grouped.design, grouped.id, input, {
		...(opts.id ? { id: opts.id } : {}),
		...(opts.now ? { now: opts.now } : {}),
	});
}
