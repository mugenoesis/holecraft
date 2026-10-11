import { MESH_SHAPE_TYPE, descendantIds, type Design, type DesignNode, type NodeId } from '@holecraft/core';
import type { Subtree } from './types.ts';

/** Bump when evaluation changes what a given subtree produces, so cached results are not reused. */
const FORMAT = 'v1';

/** Top-level solid groups: the ones drawn as one merged mesh. Inner groups are evaluated as part of their parent. */
export function rootSolidGroups(design: Design): NodeId[] {
  return design.roots.filter((id) => {
    const node = design.nodes[id];
    return node?.kind === 'group' && node.mode === 'solid' && !node.hidden;
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

/** Everything about a node that affects the shape it produces, and nothing that doesn't (names, colours). */
function describe(nodes: Record<NodeId, DesignNode>, id: NodeId, isRoot: boolean): unknown {
  const node = nodes[id];
  if (!node || node.kind === 'mesh') return null;
  if (node.kind === 'shape') {
    return ['s', node.shapeType, node.mode, node.transform, Object.entries(node.params).sort(([a], [b]) => a.localeCompare(b))];
  }
  const children = node.children.map((c) => describe(nodes, c, false));
  // The root group's own transform and mode only matter to whoever places it, not to its shape.
  return isRoot ? ['g', node.op, children] : ['g', node.mode, node.transform, node.op, children];
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
