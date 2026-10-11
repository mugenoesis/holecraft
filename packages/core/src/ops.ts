import type { Bounds, Vec3 } from './camera.ts';
import type { Design, Mat4, NodeId, ShapeNode } from './design.ts';
import { newId } from './ids.ts';
import { getShapeDef, type ShapeType } from './shapes.ts';

export function translation(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function translationOf(m: Readonly<Mat4>): Vec3 {
  return [m[12]!, m[13]!, m[14]!];
}

export interface AddShapeOptions {
  /** Fixed id, for deterministic tests. */
  id?: NodeId;
  now?: Date;
}

/**
 * Returns a new design with a solid shape centred on `at` (workplane X/Y) and resting on
 * the workplane. Pure: the input design is left untouched.
 */
export function addShape(
  design: Design,
  type: ShapeType,
  at: [number, number],
  opts: AddShapeOptions = {},
): { design: Design; id: NodeId } {
  const def = getShapeDef(type);
  const id = opts.id ?? newId();
  const count = Object.values(design.nodes).filter((n) => n.kind === 'shape' && n.shapeType === type).length;
  const [width, depth, height] = def.defaultSize;

  const node: ShapeNode = {
    id,
    kind: 'shape',
    shapeType: type,
    name: `${def.name} ${count + 1}`,
    transform: translation(at[0], at[1], 0),
    mode: 'solid',
    color: def.color,
    hidden: false,
    locked: false,
    params: { width, depth, height },
  };

  return {
    id,
    design: {
      ...design,
      nodes: { ...design.nodes, [id]: node },
      roots: [...design.roots, id],
      updatedAt: (opts.now ?? new Date()).toISOString(),
    },
  };
}

/** Axis-aligned bounds of all visible top-level shapes, or null when there are none. */
export function designBounds(design: Design): Bounds | null {
  let bounds: Bounds | null = null;
  for (const id of design.roots) {
    const node = design.nodes[id];
    if (!node || node.hidden || node.kind !== 'shape') continue;
    const { width, depth, height } = node.params as { width: number; depth: number; height: number };
    const [x, y, z] = translationOf(node.transform);
    const min: Vec3 = [x - width / 2, y - depth / 2, z];
    const max: Vec3 = [x + width / 2, y + depth / 2, z + height];
    bounds = bounds
      ? {
          min: [0, 1, 2].map((k) => Math.min(bounds!.min[k]!, min[k]!)) as Vec3,
          max: [0, 1, 2].map((k) => Math.max(bounds!.max[k]!, max[k]!)) as Vec3,
        }
      : { min, max };
  }
  return bounds;
}
