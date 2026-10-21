import type { Vec3 } from './camera.ts';
import { type Design, type DesignNode, MAX_NAME_LENGTH, type NodeId, type ShapeNode, type SolidMode } from './design.ts';
import { stretchTreatments } from './edgeEdits.ts';
import { clampToWorkplane, snapToGrid } from './grid.ts';
import { descendantIds } from './groups.ts';
import { type GroupResizeOptions, setGroupGeometry, setGroupRotation } from './groupTransform.ts';
import { newId } from './ids.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import { MESH_SHAPE_TYPE } from './meshShape.ts';
import { nodeBoundsIn, shapeBounds, translationOf } from './ops.ts';
import { stretchPaint } from './paintEdits.ts';
import type { ShapeGeometry } from './resize.ts';
import { composeTransform, eulerToMatrix, isUpright, rotationOfTransform, shapeCenter } from './rotation.ts';
import { getShapeDef, type ShapeType } from './shapes.ts';
import { isThreadedType, minThreadHeight, threadFootprint } from './threadStandards.ts';

/**
 * Pure editing operations. Each returns a new Design, or the very same object when nothing
 * changed, so callers can skip recording an undo step with a simple identity check.
 */

export { MAX_SHAPE_SIZE } from './limits.ts';

const stamp = (now?: Date) => (now ?? new Date()).toISOString();
const isEditable = (n: DesignNode | undefined): n is DesignNode => !!n && !n.locked;

function withNodes(design: Design, nodes: Record<NodeId, DesignNode>, now?: Date): Design {
	return { ...design, nodes, updatedAt: stamp(now) };
}

export function moveNodes(design: Design, ids: readonly NodeId[], delta: Vec3, now?: Date): Design {
	if (delta.every((v) => v === 0)) return design;
	const nodes = { ...design.nodes };
	let changed = false;
	for (const id of ids) {
		const node = nodes[id];
		if (!isEditable(node)) continue;
		const m = [...node.transform];
		m[12] = m[12]! + delta[0];
		m[13] = m[13]! + delta[1];
		m[14] = m[14]! + delta[2];
		nodes[id] = { ...node, transform: m };
		changed = true;
	}
	return changed ? withNodes(design, nodes, now) : design;
}

export interface MoveSelectionOptions {
	/** Grid step in mm; 0 turns snapping off. */
	snap: number;
	/** Workplane width and depth in mm. */
	size: [number, number];
}

/**
 * Drag-move: the first selected shape (the one under the pointer) is snapped to the grid
 * and kept on the workplane, and the rest of the selection moves by the same amount.
 * `delta` is the raw pointer movement since the drag began, applied to `base`.
 */
export function moveSelection(base: Design, ids: readonly NodeId[], delta: [number, number], opts: MoveSelectionOptions): Design {
	const leaderId = ids.find((id) => isEditable(base.nodes[id]));
	if (leaderId === undefined) return base;
	// A shape is positioned by its base point; a group's own origin tells you nothing about where
	// its contents are, so it is positioned by the middle of what it holds.
	const bounds = base.nodes[leaderId]!.kind === 'group' ? nodeBoundsIn(base, leaderId) : null;
	const [sx, sy] = bounds
		? [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2]
		: translationOf(base.nodes[leaderId]!.transform);
	const [tx, ty] = clampToWorkplane([snapToGrid(sx + delta[0], opts.snap), snapToGrid(sy + delta[1], opts.snap)], opts.size);
	return moveNodes(base, ids, [tx - sx, ty - sy, 0]);
}

/** Sets X and Y, and optionally the height above the workplane (never below it). */
export function setNodePosition(design: Design, id: NodeId, at: [number, number, number?], now?: Date): Design {
	const node = design.nodes[id];
	const z = at[2];
	if (!isEditable(node) || !at.every((v) => v === undefined || Number.isFinite(v)) || (z !== undefined && z < 0)) return design;
	const [x, y, currentZ] = translationOf(node.transform);
	return moveNodes(design, [id], [at[0] - x, at[1] - y, (z ?? currentZ) - currentZ], now);
}

/**
 * Moves shapes straight up or down until their lowest point rests on the workplane. X and Y
 * are kept, and a tipped shape ends up touching the plane at its lowest corner.
 */
export function dropToWorkplane(design: Design, ids: readonly NodeId[], now?: Date): Design {
	const nodes = { ...design.nodes };
	let changed = false;
	for (const id of ids) {
		const node = nodes[id];
		if (!isEditable(node)) continue;
		const bounds = node.kind === 'shape' ? shapeBounds(node) : node.kind === 'group' ? nodeBoundsIn(design, id) : null;
		if (!bounds) continue;
		const lowest = bounds.min[2];
		if (Math.abs(lowest) < 1e-9) continue;
		const transform = [...node.transform];
		transform[14] = transform[14]! - lowest;
		nodes[id] = { ...node, transform };
		changed = true;
	}
	return changed ? withNodes(design, nodes, now) : design;
}

/**
 * Sets a shape's orientation (a row-major 3x3 rotation), turning it about its own centre so
 * it stays where it is. Size is untouched. A group is turned about the middle of its contents instead.
 */
export function setNodeRotation(design: Design, id: NodeId, rotation: readonly number[], now?: Date): Design {
	const node = design.nodes[id];
	if (node?.kind === 'group') return setGroupRotation(design, id, rotation, now);
	if (!isEditable(node) || node.kind !== 'shape' || rotation.length !== 9 || !rotation.every(Number.isFinite)) return design;
	const height = node.params.height as number;
	const centre = shapeCenter(node.transform, height);
	const half = height / 2;
	const base: Vec3 = [centre[0] - rotation[2]! * half, centre[1] - rotation[5]! * half, centre[2] - rotation[8]! * half];
	const transform = composeTransform(base, rotation);
	if (transform.every((v, i) => Math.abs(v - node.transform[i]!) < 1e-9)) return design;
	return withNodes(design, { ...design.nodes, [id]: { ...node, transform } }, now);
}

/** Like setNodeRotation, from typed angles in degrees (X, then Y, then Z, about the world axes). */
export function setNodeEuler(design: Design, id: NodeId, degrees: readonly [number, number, number], now?: Date): Design {
	return setNodeRotation(design, id, eulerToMatrix(degrees), now);
}

/** Sets a shape's position, height above the workplane and size in one edit (a handle drag). */
/**
 * `node` with its edge treatments stretched by the change in size from `before` to `after`, so a resized shape keeps its chamfers and rounds
 * on its edges (they are stored in the shape's own frame, base centre at the origin).
 */
function withStretchedEdges(node: ShapeNode, before: ShapeNode['params'], after: ShapeNode['params']): ShapeNode {
	if (!node.edges && !node.paint) return node;
	const ratio = (['width', 'depth', 'height'] as const).map((k) => Number(after[k]) / Number(before[k])) as Vec3;
	const [edges, paint] = [stretchTreatments(node.edges, ratio, null), stretchPaint(node.paint, ratio, null)];
	return { ...node, ...(edges && { edges }), ...(paint && { paint }) };
}

/** A thread keeps its real width and depth (from its size, fit and head), and a bolt at least its head and a pitch of shank: whatever was asked is put right. */
function lockFootprint(node: ShapeNode, params: ShapeNode['params']): ShapeNode['params'] {
	if (!isThreadedType(node.shapeType)) return params;
	[params.width, params.depth] = threadFootprint(node.shapeType, node.params);
	params.height = Math.max(Number(params.height), minThreadHeight(node.shapeType, node.params) ?? 0);
	return params;
}

export function setShapeGeometry(design: Design, id: NodeId, g: ShapeGeometry, now?: Date, options?: GroupResizeOptions): Design {
	const node = design.nodes[id];
	if (node?.kind === 'group') return setGroupGeometry(design, id, g, now, options);
	if (!isEditable(node) || node.kind !== 'shape') return design;
	const sizes = [g.width, g.depth, g.height];
	// an upright shape's base is its lowest point, so it stays on or above the workplane; a tilted one reaches below its base centre
	const belowFloor = g.z < 0 && isUpright(rotationOfTransform(node.transform));
	if (![g.x, g.y, g.z, ...sizes].every(Number.isFinite) || belowFloor || sizes.some((v) => v <= 0 || v > MAX_SHAPE_SIZE)) return design;

	const [x, y, z] = translationOf(node.transform);
	const params = lockFootprint(node, { ...node.params, width: g.width, depth: g.depth, height: g.height });
	const same =
		x === g.x &&
		y === g.y &&
		z === g.z &&
		node.params.width === params.width &&
		node.params.depth === params.depth &&
		node.params.height === g.height;
	if (same) return design;

	const transform = [...node.transform];
	transform[12] = g.x;
	transform[13] = g.y;
	transform[14] = g.z;
	return withNodes(design, { ...design.nodes, [id]: withStretchedEdges({ ...node, transform, params }, node.params, params) }, now);
}

export function setShapeSize(design: Design, id: NodeId, size: Partial<Record<'width' | 'depth' | 'height', number>>, now?: Date): Design {
	const node = design.nodes[id];
	if (!isEditable(node) || node.kind !== 'shape') return design;
	const params = { ...node.params };
	let changed = false;
	for (const key of ['width', 'depth', 'height'] as const) {
		const v = size[key];
		if (v === undefined || !Number.isFinite(v) || v <= 0 || v > MAX_SHAPE_SIZE || v === params[key]) continue;
		params[key] = v;
		changed = true;
	}
	lockFootprint(node, params);
	changed = (['width', 'depth', 'height'] as const).some((k) => params[k] !== node.params[k]);
	return changed ? withNodes(design, { ...design.nodes, [id]: withStretchedEdges({ ...node, params }, node.params, params) }, now) : design;
}

export function renameNode(design: Design, id: NodeId, name: string, now?: Date): Design {
	const node = design.nodes[id];
	const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
	if (!node || !trimmed || trimmed === node.name) return design;
	return withNodes(design, { ...design.nodes, [id]: { ...node, name: trimmed } }, now);
}

/** Recolours shapes, and everything inside any groups given. */
export function setNodeColor(design: Design, ids: readonly NodeId[], color: string, now?: Date): Design {
	if (!/^#[0-9a-f]{6}$/i.test(color)) return design;
	const next = color.toLowerCase();
	const nodes = { ...design.nodes };
	let changed = false;

	const recolor = (id: NodeId) => {
		const node = nodes[id];
		if (!node) return;
		if (node.kind === 'group') node.children.forEach(recolor);
		if (node.color === next) return;
		nodes[id] = { ...node, color: next };
		changed = true;
	};

	for (const id of ids) if (isEditable(design.nodes[id])) recolor(id);
	return changed ? withNodes(design, nodes, now) : design;
}

/** Turns shapes and groups into holes, or back into solids. The colour is kept, so toggling is lossless. */
export function setNodeMode(design: Design, ids: readonly NodeId[], mode: SolidMode, now?: Date): Design {
	const nodes = { ...design.nodes };
	let changed = false;
	for (const id of ids) {
		const node = nodes[id];
		if (!isEditable(node) || node.mode === mode) continue;
		nodes[id] = { ...node, mode };
		changed = true;
	}
	return changed ? withNodes(design, nodes, now) : design;
}

/** Points an imported model at another stored mesh (a repaired copy of it, say); its size, place, colour and name are kept. */
export function setMeshRef(design: Design, id: NodeId, ref: string, now?: Date): Design {
	const node = design.nodes[id];
	// 'mesh' is MESH_SHAPE_TYPE (meshShape.ts imports this file, so the name is written out here)
	if (!isEditable(node) || node.kind !== 'shape' || node.shapeType !== 'mesh' || !/^[0-9a-f]{64}$/.test(ref) || node.params.mesh === ref)
		return design;
	return withNodes(design, { ...design.nodes, [id]: { ...node, params: { ...node.params, mesh: ref } } }, now);
}

/** Deletes shapes and groups, including everything inside any group. */
export function deleteNodes(design: Design, ids: readonly NodeId[], now?: Date): Design {
	const doomed = new Set<NodeId>();
	for (const id of ids) {
		if (!isEditable(design.nodes[id])) continue;
		doomed.add(id);
		for (const inner of descendantIds(design, id)) doomed.add(inner);
	}
	if (doomed.size === 0) return design;
	const nodes = Object.fromEntries(Object.entries(design.nodes).filter(([id]) => !doomed.has(id)));
	return { ...withNodes(design, nodes, now), roots: design.roots.filter((id) => !doomed.has(id)) };
}

/**
 * Copies shapes and groups (groups deeply, with fresh ids throughout) in the order given. Each
 * copy lands at the top level, offset on the workplane as a whole.
 */
export function duplicateNodes(
	design: Design,
	ids: readonly NodeId[],
	offset: [number, number],
	now?: Date,
): { design: Design; ids: NodeId[] } {
	const nodes = { ...design.nodes };
	const roots = [...design.roots];
	const created: NodeId[] = [];

	const clone = (id: NodeId): NodeId | null => {
		const node = design.nodes[id];
		if (!node || node.kind === 'mesh') return null; // imported meshes arrive in a later phase
		const copyId = newId();
		if (node.kind === 'shape') {
			const count = Object.values(nodes).filter((n) => n.kind === 'shape' && n.shapeType === node.shapeType).length;
			nodes[copyId] = {
				...node,
				id: copyId,
				name:
					node.shapeType === MESH_SHAPE_TYPE ? copyName(node.name, nodes) : `${getShapeDef(node.shapeType as ShapeType).name} ${count + 1}`,
				transform: [...node.transform],
				params: { ...node.params },
			};
		} else {
			const children = node.children.map(clone).filter((c): c is NodeId => c !== null);
			const count = Object.values(nodes).filter((n) => n.kind === 'group').length;
			nodes[copyId] = { ...node, id: copyId, name: `Group ${count + 1}`, transform: [...node.transform], children };
		}
		return copyId;
	};

	for (const id of ids) {
		const copyId = clone(id);
		if (!copyId) continue;
		const copy = nodes[copyId]!;
		const transform = [...copy.transform];
		transform[12] = transform[12]! + offset[0];
		transform[13] = transform[13]! + offset[1];
		nodes[copyId] = { ...copy, transform };
		roots.push(copyId);
		created.push(copyId);
	}
	return created.length ? { design: { ...design, nodes, roots, updatedAt: stamp(now) }, ids: created } : { design, ids: [] };
}

/** "Bracket" becomes "Bracket copy", then "Bracket copy 2", "Bracket copy 3"... (copies of copies keep counting). */
function copyName(name: string, nodes: Record<NodeId, { name: string }>): string {
	const base = name.replace(/ copy( \d+)?$/, '');
	const taken = new Set(Object.values(nodes).map((n) => n.name));
	if (!taken.has(`${base} copy`)) return `${base} copy`;
	for (let n = 2; ; n++) if (!taken.has(`${base} copy ${n}`)) return `${base} copy ${n}`;
}

/**
 * Selection after a click. `id` is null for empty space. Shift adds or removes; a plain click
 * replaces, unless `keepGroup` is set and the shape is already selected (so a multi-selection
 * can be dragged by any member).
 */
export function toggleSelection(
	selected: readonly NodeId[],
	id: NodeId | null,
	additive: boolean,
	opts: { keepGroup?: boolean } = {},
): NodeId[] {
	if (id === null) return additive ? [...selected] : [];
	if (additive) return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
	return opts.keepGroup && selected.includes(id) ? [...selected] : [id];
}

export function selectAll(design: Design): NodeId[] {
	return design.roots.filter((id) => {
		const n = design.nodes[id];
		return n && !n.hidden && !n.locked;
	});
}

export function pruneSelection(design: Design, selected: readonly NodeId[]): NodeId[] {
	return selected.filter((id) => id in design.nodes);
}

/** World X/Y unit axes that arrow keys move along, given the camera azimuth. */
export function nudgeDirections(azimuth: number): { right: [number, number]; up: [number, number] } {
	const axis = (x: number, y: number): [number, number] => (Math.abs(x) >= Math.abs(y) ? [x < 0 ? -1 : 1, 0] : [0, y < 0 ? -1 : 1]);
	return {
		right: axis(Math.cos(azimuth), Math.sin(azimuth)),
		up: axis(-Math.sin(azimuth), Math.cos(azimuth)),
	};
}
