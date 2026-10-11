export type ShapeType = 'box' | 'cylinder' | 'sphere';

export interface ShapeDef {
  id: ShapeType;
  name: string;
  /** Width (X), depth (Y), height (Z) in mm. */
  defaultSize: [number, number, number];
  color: string;
}

/**
 * Built-in shapes. Each is built into a unit-sized mesh whose base sits on z=0 and is
 * scaled by its width/depth/height params, so the document only stores sizes.
 */
export const SHAPE_DEFS: readonly ShapeDef[] = [
  { id: 'box', name: 'Box', defaultSize: [20, 20, 20], color: '#f28c28' },
  { id: 'cylinder', name: 'Cylinder', defaultSize: [20, 20, 20], color: '#2a9d8f' },
  { id: 'sphere', name: 'Sphere', defaultSize: [20, 20, 20], color: '#e76f51' },
];

export function isShapeType(value: string): value is ShapeType {
  return SHAPE_DEFS.some((d) => d.id === value);
}

export function getShapeDef(type: ShapeType): ShapeDef {
  const def = SHAPE_DEFS.find((d) => d.id === type);
  if (!def) throw new Error(`Unknown shape type: ${type}`);
  return def;
}
