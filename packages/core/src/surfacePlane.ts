import type { Vec3 } from './camera.ts';
import type { Design, NodeId } from './design.ts';
import { groupLocalBounds } from './groupTransform.ts';
import { multiplyMat4 } from './mat4.ts';
import { addShape, nodeBoundsIn, shapeBounds, translation } from './ops.ts';
import { composeTransform, type Mat3 } from './rotation.ts';
import type { ShapeType } from './shapes.ts';

/**
 * A temporary working plane on some surface (the Workplane tool): where new shapes are put. It lives in the
 * editor, not in the design. `normal` is a unit vector pointing out of the surface.
 */
export interface WorkPlane {
	origin: Vec3;
	normal: Vec3;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
	const len = Math.hypot(...a);
	return [a[0] / len, a[1] / len, a[2] / len];
};
/** Rounds away float noise and -0. */
const tidy = (n: number) => Math.round(n * 1e9) / 1e9 + 0;

/** An underside can't be built on: the shape would hang below its face, so only tops and sides are usable. */
export function isUsablePlane(normal: Vec3): boolean {
	return normal[2] > -0.9;
}

/**
 * The rotation (row-major) that stands a shape on a plane: its local z is the plane's normal, local x runs
 * along the horizontal (so on a wall the shape's y is up), and local y completes a right-handed turn.
 */
export function planeFrame(normal: Vec3): Mat3 {
	const n = unit(normal);
	const flat = Math.abs(n[2]) > 0.9999;
	const u: Vec3 = flat ? [1, 0, 0] : unit(cross([0, 0, 1], n));
	const v = cross(n, u);
	return [u[0], v[0], n[0], u[1], v[1], n[1], u[2], v[2], n[2]].map(tidy);
}

function axes(plane: WorkPlane): { u: Vec3; v: Vec3 } {
	const r = planeFrame(plane.normal);
	return { u: [r[0]!, r[3]!, r[6]!], v: [r[1]!, r[4]!, r[7]!] };
}

/** A point's position on the plane as distances (u, v) from its origin. */
export function planeCoords(plane: WorkPlane, p: Vec3): [number, number] {
	const { u, v } = axes(plane);
	const d: Vec3 = [p[0] - plane.origin[0], p[1] - plane.origin[1], p[2] - plane.origin[2]];
	return [dot(d, u), dot(d, v)];
}

/** The world point at (u, v) on the plane. */
export function planePoint(plane: WorkPlane, u: number, v: number): Vec3 {
	const a = axes(plane);
	return [0, 1, 2].map((k) => plane.origin[k]! + a.u[k]! * u + a.v[k]! * v) as Vec3;
}

/** `p` moved onto the plane's grid (steps of `snap` mm measured from the plane's origin); `snap` 0 leaves it. */
export function snapOnPlane(plane: WorkPlane, p: Vec3, snap: number): Vec3 {
	if (snap <= 0) return p;
	const [u, v] = planeCoords(plane, p);
	return planePoint(plane, Math.round(u / snap) * snap, Math.round(v / snap) * snap);
}

/**
 * Adds a shape standing on the plane at `point`: its base on the surface and its height going out of it.
 * It is lifted if that would put any of it below the workplane. An underside is refused (`id` is null).
 */
export function addShapeOnPlane(
	design: Design,
	type: ShapeType,
	plane: WorkPlane,
	point: Vec3,
	opts: { id?: NodeId; now?: Date } = {},
): { design: Design; id: NodeId | null } {
	if (!isUsablePlane(plane.normal)) return { design, id: null };
	const added = addShape(design, type, [0, 0], opts);
	const node = added.design.nodes[added.id];
	if (node?.kind !== 'shape') return { design, id: null };

	const placed = { ...node, transform: composeTransform(point, planeFrame(plane.normal)) };
	const lowest = shapeBounds(placed).min[2];
	if (lowest < 0) placed.transform[14] = placed.transform[14]! - lowest;
	return { design: { ...added.design, nodes: { ...added.design.nodes, [added.id]: placed } }, id: added.id };
}

/** Whether `standOnPlane` has something to do: exactly one shape or group is selected, and it is unlocked and not hidden. */
export function canStandOnPlane(design: Design, selection: readonly NodeId[]): boolean {
	const node = selection.length === 1 ? design.nodes[selection[0]!] : undefined;
	return !!node && node.kind !== 'mesh' && !node.locked && !node.hidden;
}

/**
 * Puts an existing shape or group on the plane, the way a new shape is put there: its base on the surface and its height going out of it, turned to
 * match (a wall puts its up along the face's horizontal, as for a new shape), under the point where its middle is above or in front of the plane.
 * What is lower than the workplane after that is lifted. The same design back (so nothing to undo) for an underside, a plane with no direction, a
 * locked or hidden or missing node, and for one already there.
 */
export function standOnPlane(design: Design, id: NodeId, plane: WorkPlane, now?: Date): Design {
	const node = design.nodes[id];
	const length = Math.hypot(...plane.normal);
	if (!node || node.locked || !(length > 1e-6) || !isUsablePlane(unit(plane.normal))) return design;
	const around = nodeBoundsIn(design, id);
	if (!around) return design;

	const n = unit(plane.normal);
	const middle = [0, 1, 2].map((k) => (around.min[k]! + around.max[k]!) / 2) as Vec3;
	const away = dot([middle[0] - plane.origin[0], middle[1] - plane.origin[1], middle[2] - plane.origin[2]], n);
	const point = middle.map((v, k) => v - away * n[k]!) as Vec3;

	// the node's own base centre: a shape's is its origin, a group's the middle of its contents' footprint at their lowest
	const inner = node.kind === 'group' ? groupLocalBounds(design, id) : null;
	const base: Vec3 = inner ? [(inner.min[0] + inner.max[0]) / 2, (inner.min[1] + inner.max[1]) / 2, inner.min[2]] : [0, 0, 0];
	const transform = multiplyMat4(composeTransform(point, planeFrame(n)), translation(-base[0], -base[1], -base[2])).map(tidy);

	const placed = { ...node, transform };
	const trial = { ...design, nodes: { ...design.nodes, [id]: placed } };
	const lowest = nodeBoundsIn(trial, id)?.min[2] ?? 0;
	if (lowest < 0) transform[14] = tidy(transform[14]! - lowest);
	if (transform.every((v, i) => Math.abs(v - node.transform[i]!) < 1e-9)) return design;
	return { ...trial, updatedAt: (now ?? new Date()).toISOString() };
}
