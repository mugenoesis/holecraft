import type { DesignNode, NodeId } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { evaluateNode, type MeshTable } from './evaluate.ts';
import type { GroupMesh } from './types.ts';

export { evaluateNode } from './evaluate.ts';

/** One printable body: a top-level shape or group, in world coordinates (mm, Z up). */
export interface ExportBody {
  name: string;
  /** #rrggbb */
  color: string;
  mesh: GroupMesh;
}

/**
 * Everything that would be printed: each visible top-level solid shape or group, with its holes
 * cut out and its place in the design applied. Holes, hidden things and anything the holes cut away
 * completely are left out. Bodies keep the order of the design.
 */
export function collectBodies(M: ManifoldToplevel, design: { nodes: Record<NodeId, DesignNode>; roots: NodeId[] }, meshes?: MeshTable): ExportBody[] {
  const bodies: ExportBody[] = [];
  for (const id of design.roots) {
    const node = design.nodes[id];
    if (!node || node.hidden || node.mode !== 'solid' || node.kind === 'mesh') continue;
    const mesh = evaluateNode(M, design, id, meshes);
    if (mesh) bodies.push({ name: node.name, color: node.color, mesh });
  }
  return bodies;
}
