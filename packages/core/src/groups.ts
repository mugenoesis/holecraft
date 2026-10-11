import type { Design, DesignNode, GroupNode, NodeId } from './design.ts';
import { IDENTITY } from './design.ts';
import { newId } from './ids.ts';
import { multiplyMat4 } from './mat4.ts';

/**
 * Grouping. A group is a node whose children live in its coordinate frame: a child's world
 * transform is the group's transform times its own. Only top-level nodes are listed in
 * `design.roots`; a group's children are reachable through it.
 */

const stamp = (now?: Date) => (now ?? new Date()).toISOString();
const isEditable = (n: DesignNode | undefined): n is DesignNode => !!n && !n.locked;

/** Every node inside a group, at any depth (not including the group itself). */
export function descendantIds(design: Design, id: NodeId): NodeId[] {
  const node = design.nodes[id];
  if (!node || node.kind !== 'group') return [];
  return node.children.flatMap((child) => [child, ...descendantIds(design, child)]);
}

/** True when `groupNodes` would make a group: at least two unlocked top-level nodes. */
export function canGroup(design: Design, ids: readonly NodeId[]): boolean {
  const wanted = new Set(ids);
  return design.roots.filter((id) => wanted.has(id) && isEditable(design.nodes[id])).length >= 2;
}

/** True when `ungroupNodes` would dissolve something: the selection includes an unlocked top-level group. */
export function canUngroup(design: Design, ids: readonly NodeId[]): boolean {
  const wanted = new Set(ids);
  return design.roots.some((id) => {
    const n = design.nodes[id];
    return wanted.has(id) && n?.kind === 'group' && !n.locked;
  });
}

export interface GroupOptions {
  /** Fixed id for the new group, for deterministic tests. */
  id?: NodeId;
  now?: Date;
}

/**
 * Wraps top-level shapes and groups in a new group, placed where the first of them was. Every
 * member keeps its place in the scene, since the new group starts with an identity transform.
 * Needs at least two unlocked top-level nodes; otherwise the same design comes back and `id` is null.
 */
export function groupNodes(design: Design, ids: readonly NodeId[], opts: GroupOptions = {}): { design: Design; id: NodeId | null } {
  const wanted = new Set(ids);
  const members = design.roots.filter((id) => wanted.has(id) && isEditable(design.nodes[id]));
  if (members.length < 2) return { design, id: null };

  const id = opts.id ?? newId();
  const count = Object.values(design.nodes).filter((n) => n.kind === 'group').length;
  const group: GroupNode = {
    id,
    kind: 'group',
    name: `Group ${count + 1}`,
    transform: [...IDENTITY],
    mode: 'solid',
    color: design.nodes[members[0]!]!.color,
    hidden: false,
    locked: false,
    children: members,
    op: 'union',
    multicolor: false,
  };

  const inGroup = new Set(members);
  const at = design.roots.findIndex((r) => inGroup.has(r));
  const rest = design.roots.filter((r) => !inGroup.has(r));
  const roots = [...rest.slice(0, at), id, ...rest.slice(at)];

  return { design: { ...design, nodes: { ...design.nodes, [id]: group }, roots, updatedAt: stamp(opts.now) }, id };
}

/**
 * Dissolves top-level groups, one level deep. Each child takes over the group's transform so it
 * stays exactly where it was, and a hole group turns its children into holes. Returns the
 * freed children in order; with no groups to dissolve, the design is returned as is.
 */
export function ungroupNodes(design: Design, ids: readonly NodeId[], now?: Date): { design: Design; ids: NodeId[] } {
  const wanted = new Set(ids);
  const nodes = { ...design.nodes };
  const freed: NodeId[] = [];
  const roots: NodeId[] = [];

  for (const rootId of design.roots) {
    const node = design.nodes[rootId];
    if (!wanted.has(rootId) || !node || node.kind !== 'group' || node.locked) {
      roots.push(rootId);
      continue;
    }
    for (const childId of node.children) {
      const child = design.nodes[childId]!;
      nodes[childId] = { ...child, transform: multiplyMat4(node.transform, child.transform), mode: node.mode === 'hole' ? 'hole' : child.mode };
      roots.push(childId);
      freed.push(childId);
    }
    delete nodes[rootId];
  }

  return freed.length ? { design: { ...design, nodes, roots, updatedAt: stamp(now) }, ids: freed } : { design, ids: [] };
}
