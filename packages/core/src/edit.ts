import type { Vec3 } from './camera.ts';
import type { Design, DesignNode, NodeId, ShapeNode } from './design.ts';
import { clampToWorkplane, snapToGrid } from './grid.ts';
import { newId } from './ids.ts';
import { translationOf } from './ops.ts';
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

export function setNodePosition(design: Design, id: NodeId, at: [number, number], now?: Date): Design {
  const node = design.nodes[id];
  if (!isEditable(node) || !at.every(Number.isFinite)) return design;
  const [x, y] = translationOf(node.transform);
  return moveNodes(design, [id], [at[0] - x, at[1] - y, 0], now);
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
