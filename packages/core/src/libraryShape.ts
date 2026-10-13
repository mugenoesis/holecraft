import type { Vec3 } from './camera.ts';
import { createEmptyDesign, type Design, type DesignNode, type NodeId } from './design.ts';
import { descendantIds } from './groups.ts';
import { newId } from './ids.ts';
import { nodeBoundsIn } from './ops.ts';
import { standOnPlane, type WorkPlane } from './surfacePlane.ts';

/**
 * Saved shapes (the library): a shape or group kept for reuse in any design. One is stored as a small design of its own whose single root is
 * the thing saved, standing at the origin, so it is checked, saved and read like any design. Imported models in it stay by reference to their
 * stored mesh.
 */

/** What the library lists: enough for a tile. */
export interface LibrarySummary {
	id: string;
	name: string;
	/** The colour of the shape (or of the first shape in a group), for the tile's swatch. */
	color: string;
	createdAt: string;
}

const copyNode = (node: DesignNode): DesignNode => JSON.parse(JSON.stringify(node)) as DesignNode;

/**
 * The shape or group `id`, copied with everything in it into a small design called `name`, with the middle of its footprint at the origin and its
 * lowest point on the floor (how it is turned is kept).
 * Null if there is no such node (or it is a leftover mesh node). A lock or hide on the thing saved is cleared: a new copy is made to be used.
 */
export function libraryShapeOf(design: Design, id: NodeId, name: string): Design | null {
	const node = design.nodes[id];
	if (!node || node.kind === 'mesh') return null;
	const nodes: Record<NodeId, DesignNode> = {};
	for (const nodeId of [id, ...descendantIds(design, id)]) {
		const found = design.nodes[nodeId];
		if (found) nodes[nodeId] = copyNode(found);
	}
	const root = nodes[id]!;
	// moved so the middle of its footprint, at its lowest, is at the origin (the footprint of a group is not where its own origin is)
	const around = nodeBoundsIn(design, id);
	const transform = [...root.transform];
	if (around) {
		transform[12] = transform[12]! - (around.min[0] + around.max[0]) / 2;
		transform[13] = transform[13]! - (around.min[1] + around.max[1]) / 2;
		transform[14] = transform[14]! - around.min[2];
	}
	nodes[id] = { ...root, name, transform, hidden: false, locked: false };
	return { ...createEmptyDesign(newId(), name), units: design.units, palette: [...design.palette], nodes, roots: [id] };
}

/** The colour of a saved shape: the shape's own, or that of the first shape in a group. */
export function libraryColor(shape: Design): string {
	const find = (id: NodeId): string | null => {
		const node = shape.nodes[id];
		if (!node) return null;
		if (node.kind === 'group') return node.children.map(find).find((c) => c !== null) ?? null;
		return node.color;
	};
	return find(shape.roots[0] ?? '') ?? '#8d99ae';
}

interface PlaceOptions {
	/** Where on the floor its middle goes. */
	at?: [number, number];
	/** Or on a Workplane-tool plane, at this point of it. */
	plane?: WorkPlane;
	point?: Vec3;
	now?: Date;
}

/**
 * Puts a new copy of a saved shape in the design, with fresh ids throughout and the name it was saved with: on the floor with its middle at `at`
 * (lifted if any of it is below the workplane), or standing on `plane` at `point` as a new shape does. `id` is null, and the design as it was,
 * if the saved shape does not have exactly one root.
 */
export function addLibraryShape(design: Design, shape: Design, opts: PlaceOptions): { design: Design; id: NodeId | null } {
	const sourceRoot = shape.roots.length === 1 ? shape.nodes[shape.roots[0]!] : undefined;
	if (!sourceRoot) return { design, id: null };

	const ids = new Map<NodeId, NodeId>();
	const nodes = { ...design.nodes };
	const copy = (oldId: NodeId): void => {
		const node = shape.nodes[oldId];
		if (!node) return;
		const id = newId();
		ids.set(oldId, id);
		if (node.kind === 'group') node.children.forEach(copy);
	};
	copy(sourceRoot.id);
	for (const [oldId, id] of ids) {
		const node = copyNode(shape.nodes[oldId]!);
		nodes[id] = node.kind === 'group' ? { ...node, id, children: node.children.map((c) => ids.get(c)!).filter(Boolean) } : { ...node, id };
	}

	const rootId = ids.get(sourceRoot.id)!;
	const transform = [...nodes[rootId]!.transform];
	const [x, y, z] = opts.plane ? (opts.point ?? [0, 0, 0]) : [...(opts.at ?? [0, 0]), 0];
	transform[12] = transform[12]! + x!;
	transform[13] = transform[13]! + y!;
	transform[14] = transform[14]! + z!;
	nodes[rootId] = { ...nodes[rootId]!, transform };
	let placed: Design = { ...design, nodes, roots: [...design.roots, rootId], updatedAt: (opts.now ?? new Date()).toISOString() };

	if (opts.plane) {
		placed = standOnPlane(placed, rootId, opts.plane, opts.now);
	} else {
		const lowest = nodeBoundsIn(placed, rootId)?.min[2] ?? 0;
		if (lowest < 0) {
			const lifted = [...transform];
			lifted[14] = lifted[14]! - lowest;
			placed = { ...placed, nodes: { ...placed.nodes, [rootId]: { ...placed.nodes[rootId]!, transform: lifted } } };
		}
	}
	return { design: placed, id: rootId };
}
