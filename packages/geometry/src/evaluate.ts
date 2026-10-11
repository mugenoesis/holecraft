import type { DesignNode, NodeId, ShapeNode } from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { GroupMesh } from './types.ts';

/** manifold wants a 16-number tuple; a node's transform is the same column-major matrix as a plain array. */
type ManifoldMat4 = Parameters<Manifold['transform']>[0];
const asMat4 = (m: readonly number[]) => m as unknown as ManifoldMat4;

/** Facets around a cylinder, and the detail of a sphere. */
const CYLINDER_SEGMENTS = 64;
const SPHERE_SEGMENTS = 48;

type Nodes = { nodes: Record<NodeId, DesignNode> };

/**
 * Works out the single mesh a group makes: its solids joined together, minus its holes. The
 * result is in the group's own frame (the group's own transform is not applied, so moving a
 * group never means recomputing it). Returns null when nothing is left, or for anything that
 * is not a group.
 *
 * manifold objects live in WASM memory and must be freed by hand, so every one created here is
 * tracked and deleted before returning, however it returns.
 */
export function evaluateGroup(M: ManifoldToplevel, design: Nodes, groupId: NodeId): GroupMesh | null {
  const owned: Manifold[] = [];
  const track = (m: Manifold): Manifold => (owned.push(m), m);

  /** A shape as a manifold: base on z = 0, scaled to its size, then placed by its own transform. */
  const shape = (node: ShapeNode): Manifold => {
    const { width, depth, height } = node.params as { width: number; depth: number; height: number };
    let m: Manifold;
    switch (node.shapeType) {
      case 'cylinder':
        m = track(track(M.Manifold.cylinder(1, 0.5, 0.5, CYLINDER_SEGMENTS, false)).scale([width, depth, height]));
        break;
      case 'sphere':
        m = track(track(track(M.Manifold.sphere(0.5, SPHERE_SEGMENTS)).translate([0, 0, 0.5])).scale([width, depth, height]));
        break;
      default:
        m = track(track(M.Manifold.cube([width, depth, height], false)).translate([-width / 2, -depth / 2, 0]));
    }
    return track(m.transform(asMat4(node.transform)));
  };

  /** A group's contents: solids joined, holes cut out. Null when there is nothing solid left. */
  const contents = (id: NodeId): Manifold | null => {
    const group = design.nodes[id];
    if (!group || group.kind !== 'group') return null;

    const solids: Manifold[] = [];
    const holes: Manifold[] = [];
    for (const childId of group.children) {
      const child = design.nodes[childId];
      const built = child?.kind === 'shape' ? shape(child) : child?.kind === 'group' ? placed(childId) : null;
      if (built) (child!.mode === 'hole' ? holes : solids).push(built);
    }
    if (solids.length === 0) return null;

    const joined = track(group.op === 'intersect' ? M.Manifold.intersection(solids) : M.Manifold.union(solids));
    if (holes.length === 0) return joined;
    return track(joined.subtract(track(M.Manifold.union(holes))));
  };

  /** A nested group as seen from its parent: its contents, moved by its own transform. */
  const placed = (id: NodeId): Manifold | null => {
    const inner = contents(id);
    return inner ? track(inner.transform(asMat4(design.nodes[id]!.transform))) : null;
  };

  try {
    const result = contents(groupId);
    if (!result || result.isEmpty()) return null;
    const mesh = result.getMesh();
    if (mesh.triVerts.length === 0) return null;

    // Vertices may carry extra properties after xyz; keep only the positions.
    const stride = mesh.numProp;
    const vertices = mesh.vertProperties.length / stride;
    const positions = new Float32Array(vertices * 3);
    for (let v = 0; v < vertices; v++) {
      positions[v * 3] = mesh.vertProperties[v * stride]!;
      positions[v * 3 + 1] = mesh.vertProperties[v * stride + 1]!;
      positions[v * 3 + 2] = mesh.vertProperties[v * stride + 2]!;
    }
    return { positions, indices: Uint32Array.from(mesh.triVerts) };
  } finally {
    for (const m of owned) {
      try {
        m.delete();
      } catch {
        // Already freed (the same object was tracked twice); nothing to do.
      }
    }
  }
}
