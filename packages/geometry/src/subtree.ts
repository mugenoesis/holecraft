import { type Design, type DesignNode, descendantIds, MESH_SHAPE_TYPE, type NodeId } from '@holecraft/core';
import type { Subtree } from './types.ts';

/** Bump when evaluation changes what a given subtree produces, so cached results are not reused. */
const FORMAT = 'v7'; // v2: edge treatments; v3: single shapes as roots; v4: smooth cuts along curved edges; v5: hidden parts are left out; v6: paint; v7: sketches

/**
 * The top-level nodes drawn as one computed mesh: groups (their holes cut), shapes with treated edges (their chamfers and
 * rounds cut), and text (its letters are built by the geometry engine from their outlines). A hole is included: its ghost shows the finished shape, as the cut will use it, not every shape it is made from.
 * Inner groups are evaluated as part of their parent; hidden nodes are left alone.
 */
export function rootComputedNodes(design: Design): NodeId[] {
	return design.roots.filter((id) => {
		const node = design.nodes[id];
		if (!node || node.hidden) return false;
		return (
			node.kind === 'group' ||
			(node.kind === 'shape' &&
				(node.shapeType === 'text' || node.shapeType === 'sketch' || (node.edges?.length ?? 0) > 0 || (node.paint?.length ?? 0) > 0))
		);
	});
}

/** The group and every node inside it, copied out so it can be sent to a worker. */
export function subtreeOf(design: { nodes: Record<NodeId, DesignNode> }, groupId: NodeId): Subtree {
	const nodes: Record<NodeId, DesignNode> = {};
	for (const id of [groupId, ...descendantIds(design as Design, groupId)]) {
		const node = design.nodes[id];
		if (node) nodes[id] = node;
	}
	return { rootId: groupId, nodes };
}

/** The paint that shows on a root (a hole's or a nested node's does not), without the fills' ids, which are not geometry. */
function paintOf(node: DesignNode): unknown {
	if (node.kind === 'mesh' || node.mode !== 'solid') return null;
	return node.paint?.map(({ id: _id, ...fill }) => fill) ?? null;
}

/** Everything about a node that affects the shape it produces, and nothing that doesn't (names, colours). */
function describe(nodes: Record<NodeId, DesignNode>, id: NodeId, isRoot: boolean): unknown {
	const node = nodes[id];
	if (!node || node.kind === 'mesh') return null;
	if (node.kind === 'shape') {
		// A shape worked out on its own is in its own frame, so where it is doesn't matter to its shape.
		if (isRoot)
			return [
				's',
				node.shapeType,
				Object.entries(node.params).sort(([a], [b]) => a.localeCompare(b)),
				node.edges ?? null,
				paintOf(node),
				node.sketch ?? null,
			];
		return [
			's',
			node.shapeType,
			node.mode,
			node.transform,
			Object.entries(node.params).sort(([a], [b]) => a.localeCompare(b)),
			node.edges ?? null,
			node.sketch ?? null,
		];
	}
	const children = node.children.filter((c) => !nodes[c]?.hidden).map((c) => describe(nodes, c, false)); // a hidden part is not part of the shape
	// The root group's own transform and mode only matter to whoever places it, not to its shape.
	return isRoot
		? ['g', node.op, children, node.edges ?? null, paintOf(node)]
		: ['g', node.mode, node.transform, node.op, children, node.edges ?? null];
}

/** cyrb53: a fast, well-spread 53-bit string hash. Collisions are not a practical concern here. */
function cyrb53(text: string): number {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A key for the shape a group produces. Equal keys mean equal geometry, so a result can be
 * reused after undo, or when only the group's position, name or colour changed.
 */
export function subtreeHash(design: { nodes: Record<NodeId, DesignNode> }, groupId: NodeId): string {
	return cyrb53(FORMAT + JSON.stringify(describe(design.nodes, groupId, true))).toString(36);
}

/** The stored meshes needed to build these nodes (and everything inside them), each listed once. */
export function meshRefsIn(design: { nodes: Record<NodeId, DesignNode> }, ids: readonly NodeId[]): string[] {
	const refs = new Set<string>();
	const visit = (id: NodeId): void => {
		const node = design.nodes[id];
		if (!node) return;
		if (node.kind === 'group') node.children.forEach(visit);
		else if (node.kind === 'shape' && node.shapeType === MESH_SHAPE_TYPE) refs.add(String(node.params.mesh));
	};
	ids.forEach(visit);
	return [...refs];
}
