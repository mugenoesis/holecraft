import type { Vec3 } from './camera.ts';
import type { Design, DesignNode, NodeId, ShapeNode } from './design.ts';
import { clampToWorkplane, snapToGrid } from './grid.ts';
import { newId } from './ids.ts';
import { shapeBounds, translationOf } from './ops.ts';
import type { ShapeGeometry } from './resize.ts';
import { composeTransform, eulerToMatrix, shapeCenter } from './rotation.ts';
import { getShapeDef, type ShapeType } from './shapes.ts';

/**
 * Pure editing operations. Each returns a new Design, or the very same object when nothing
 * changed, so callers can skip recording an undo step with a simple identity check.
 */

export const MAX_SHAPE_SIZE = 1000;

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
  const [sx, sy] = translationOf(base.nodes[leaderId]!.transform);
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
    if (!isEditable(node) || node.kind !== 'shape') continue;
    const lowest = shapeBounds(node).min[2];
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
 * it stays where it is. Size is untouched.
 */
export function setNodeRotation(design: Design, id: NodeId, rotation: readonly number[], now?: Date): Design {
  const node = design.nodes[id];
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
export function setShapeGeometry(design: Design, id: NodeId, g: ShapeGeometry, now?: Date): Design {
  const node = design.nodes[id];
  if (!isEditable(node) || node.kind !== 'shape') return design;
  const sizes = [g.width, g.depth, g.height];
  if (![g.x, g.y, g.z, ...sizes].every(Number.isFinite) || g.z < 0 || sizes.some((v) => v <= 0 || v > MAX_SHAPE_SIZE)) return design;

  const [x, y, z] = translationOf(node.transform);
  const same = x === g.x && y === g.y && z === g.z && node.params.width === g.width && node.params.depth === g.depth && node.params.height === g.height;
  if (same) return design;

  const transform = [...node.transform];
  transform[12] = g.x;
  transform[13] = g.y;
  transform[14] = g.z;
  const params = { ...node.params, width: g.width, depth: g.depth, height: g.height };
  return withNodes(design, { ...design.nodes, [id]: { ...node, transform, params } }, now);
}

export function setShapeSize(
  design: Design,
  id: NodeId,
  size: Partial<Record<'width' | 'depth' | 'height', number>>,
  now?: Date,
): Design {
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
  return changed ? withNodes(design, { ...design.nodes, [id]: { ...node, params } }, now) : design;
}

export function renameNode(design: Design, id: NodeId, name: string, now?: Date): Design {
  const node = design.nodes[id];
  const trimmed = name.trim();
  if (!node || !trimmed || trimmed === node.name) return design;
  return withNodes(design, { ...design.nodes, [id]: { ...node, name: trimmed } }, now);
}

export function setNodeColor(design: Design, ids: readonly NodeId[], color: string, now?: Date): Design {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return design;
  const next = color.toLowerCase();
  const nodes = { ...design.nodes };
  let changed = false;
  for (const id of ids) {
    const node = nodes[id];
    if (!isEditable(node) || node.color === next) continue;
    nodes[id] = { ...node, color: next };
    changed = true;
  }
  return changed ? withNodes(design, nodes, now) : design;
}

export function deleteNodes(design: Design, ids: readonly NodeId[], now?: Date): Design {
  const doomed = new Set(ids.filter((id) => isEditable(design.nodes[id])));
  if (doomed.size === 0) return design;
  const nodes = Object.fromEntries(Object.entries(design.nodes).filter(([id]) => !doomed.has(id)));
  return { ...withNodes(design, nodes, now), roots: design.roots.filter((id) => !doomed.has(id)) };
}

/** Copies shapes (in the order given) offset on the workplane. Meshes and groups come later. */
export function duplicateNodes(
  design: Design,
  ids: readonly NodeId[],
  offset: [number, number],
  now?: Date,
): { design: Design; ids: NodeId[] } {
  let next = design;
  const created: NodeId[] = [];
  for (const id of ids) {
    const node = design.nodes[id];
    if (!node || node.kind !== 'shape') continue;
    const count = Object.values(next.nodes).filter((n) => n.kind === 'shape' && n.shapeType === node.shapeType).length;
    const copyId = newId();
    const transform = [...node.transform];
    transform[12] = transform[12]! + offset[0];
    transform[13] = transform[13]! + offset[1];
    const copy: ShapeNode = {
      ...node,
      id: copyId,
      name: `${getShapeDef(node.shapeType as ShapeType).name} ${count + 1}`,
      transform,
      params: { ...node.params },
    };
    next = { ...next, nodes: { ...next.nodes, [copyId]: copy }, roots: [...next.roots, copyId] };
    created.push(copyId);
  }
  return created.length ? { design: { ...next, updatedAt: stamp(now) }, ids: created } : { design, ids: [] };
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
  const axis = (x: number, y: number): [number, number] =>
    Math.abs(x) >= Math.abs(y) ? [x < 0 ? -1 : 1, 0] : [0, y < 0 ? -1 : 1];
  return {
    right: axis(Math.cos(azimuth), Math.sin(azimuth)),
    up: axis(-Math.sin(azimuth), Math.cos(azimuth)),
  };
}
