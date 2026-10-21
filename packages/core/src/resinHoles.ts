import type { Design, GroupNode, NodeId, ShapeNode } from './design.ts';
import { IDENTITY } from './design.ts';
import { isStretched } from './groupFrame.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn, translation } from './ops.ts';

/**
 * Drain and vent holes for resin printing. A hollow print holds liquid resin, which has to get out (and air in) or the print is
 * sucked against the film and burst. A hole here is an ordinary cylinder hole, grouped with the shape so it cuts: it is seen, moved,
 * resized and deleted like any other shape, and nothing about it is special once it is made.
 */

export type ResinHoleKind = 'drain' | 'vent';

/** A usual size for a drain hole (resin is thick: much less than 3 mm and it will not run). */
export const DEFAULT_DRAIN_DIAMETER = 3.5;
export const MIN_DRAIN_DIAMETER = 0.5;
export const MAX_DRAIN_DIAMETER = 30;

/** How far a hole goes into the shape: a quarter of its height, between these (and never past the shape). */
const MIN_DEPTH = 3;
const MAX_DEPTH = 15;
/** How far it starts outside the shape, so it cuts clean through the face. */
const OVERSHOOT = 1;

export interface AddResinHoleOptions {
	/** Fixed ids, for deterministic tests. */
	holeId?: NodeId;
	groupId?: NodeId;
	now?: Date;
}

const LABEL: Record<ResinHoleKind, string> = { drain: 'Drain hole', vent: 'Vent hole' };

/** Whether a hole can be added: one visible, unlocked solid (a shape or a group) is selected. */
export function canAddResinHole(design: Design, ids: readonly NodeId[]): boolean {
	const id = ids.length === 1 ? ids[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	return (
		!!id && !!node && design.roots.includes(id) && !node.locked && !node.hidden && node.mode !== 'hole' && nodeBoundsIn(design, id) !== null
	);
}

/** Why a drain or vent hole cannot be added now, in words for the panel (the selection first, then the diameter), or null when it can. */
export function whyNotResinHole(design: Design, ids: readonly NodeId[], diameter: number): string | null {
	const id = ids.length === 1 ? ids[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	if (!id || !node || !design.roots.includes(id)) return 'Select one shape or group to add a drain or vent hole to it.';
	if (node.locked) return `${node.name} is locked: unlock it in the Objects list to add a hole to it.`;
	if (node.hidden) return `${node.name} is hidden: show it in the Objects list to add a hole to it.`;
	if (node.mode === 'hole') return `${node.name} is a hole: select a solid to add a drain or vent hole to.`;
	if (nodeBoundsIn(design, id) === null) return 'Select one shape or group to add a drain or vent hole to it.';
	if (!(diameter >= MIN_DRAIN_DIAMETER && diameter <= MAX_DRAIN_DIAMETER)) {
		return `The diameter must be between ${MIN_DRAIN_DIAMETER} and ${MAX_DRAIN_DIAMETER} mm.`;
	}
	return null;
}

const cleanDiameter = (d: number) =>
	Number.isFinite(d) ? Math.min(MAX_DRAIN_DIAMETER, Math.max(MIN_DRAIN_DIAMETER, d)) : DEFAULT_DRAIN_DIAMETER;

/** A group that sits where it was made (no move, turn or stretch): what is put inside it needs no conversion. */
const isPlainGroup = (node: GroupNode) => node.transform.every((v, i) => v === IDENTITY[i]) && !isStretched(node);

/**
 * Adds a drain hole at the bottom (or a vent hole at the top) of the selected shape or group, in the middle of it, and groups it with the
 * shape. A second hole joins the group the first made rather than wrapping it again. The selection afterwards is the group.
 */
export function addResinHole(
	design: Design,
	ids: readonly NodeId[],
	kind: ResinHoleKind,
	diameter: number,
	opts: AddResinHoleOptions = {},
): { design: Design; selection: NodeId[] } {
	if (!canAddResinHole(design, ids)) return { design, selection: [...ids] };
	const target = ids[0]!;
	const b = nodeBoundsIn(design, target)!;
	const height = b.max[2]! - b.min[2]!;
	const depth = Math.min(height, Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, height / 4)));
	const d = cleanDiameter(diameter);
	const z = kind === 'drain' ? b.min[2]! - OVERSHOOT : b.max[2]! - depth;

	const added = addShape(design, 'cylinder', [(b.min[0]! + b.max[0]!) / 2, (b.min[1]! + b.max[1]!) / 2], {
		...(opts.holeId ? { id: opts.holeId } : {}),
		...(opts.now ? { now: opts.now } : {}),
	});
	const taken = Object.values(design.nodes).filter((n) => n.name.startsWith(`${LABEL[kind]} `)).length;
	const shape = added.design.nodes[added.id] as ShapeNode;
	const hole: ShapeNode = {
		...shape,
		name: `${LABEL[kind]} ${taken + 1}`,
		mode: 'hole',
		transform: translation(shape.transform[12]!, shape.transform[13]!, z),
		params: { ...shape.params, width: d, depth: d, height: depth + OVERSHOOT },
	};
	const withHole: Design = { ...added.design, nodes: { ...added.design.nodes, [added.id]: hole } };

	const parent = withHole.nodes[target]!;
	if (parent.kind === 'group' && isPlainGroup(parent)) {
		const roots = withHole.roots.filter((r) => r !== added.id);
		const nodes = { ...withHole.nodes, [target]: { ...parent, children: [...parent.children, added.id] } };
		return { design: { ...withHole, nodes, roots }, selection: [target] };
	}
	const grouped = groupNodes(withHole, [target, added.id], {
		...(opts.groupId ? { id: opts.groupId } : {}),
		...(opts.now ? { now: opts.now } : {}),
	});
	return { design: grouped.design, selection: grouped.id ? [grouped.id] : [target] };
}
