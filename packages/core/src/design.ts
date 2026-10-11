import type { GridSettings } from './grid.ts';
import { DEFAULT_GRID } from './grid.ts';
import type { Units } from './units.ts';

/** Bump when the on-disk design format changes, and add a migration. */
export const DESIGN_FORMAT_VERSION = 1;

/** What the designs list shows about each saved design. */
export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Top-level shapes and groups. */
  objectCount: number;
}

/** Longest name the editor will give a design or a shape. */
export const MAX_NAME_LENGTH = 120;

export type NodeId = string;

/** Column-major 4x4 matrix, same layout as three.js `Matrix4.elements`. */
export type Mat4 = number[];

export const IDENTITY: Readonly<Mat4> = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export type SolidMode = 'solid' | 'hole';

export interface BaseNode {
  id: NodeId;
  name: string;
  transform: Mat4;
  mode: SolidMode;
  color: string;
  hidden: boolean;
  locked: boolean;
}

/** A parametric primitive (box, cylinder, text, ...) built by the geometry worker. */
export interface ShapeNode extends BaseNode {
  kind: 'shape';
  shapeType: string;
  params: Record<string, number | string | boolean>;
}

/** An imported mesh (STL, OBJ, 3MF); geometry lives in a separate blob. */
export interface MeshNode extends BaseNode {
  kind: 'mesh';
  meshRef: string;
}

/**
 * A group evaluates to union(solid children) minus union(hole children).
 * The boolean result is a derived cache and never stored, so ungrouping is lossless.
 */
export interface GroupNode extends BaseNode {
  kind: 'group';
  children: NodeId[];
  op: 'union' | 'intersect';
  multicolor: boolean;
}

export type DesignNode = ShapeNode | MeshNode | GroupNode;

export interface Design {
  formatVersion: number;
  id: string;
  name: string;
  units: Units;
  grid: GridSettings;
  nodes: Record<NodeId, DesignNode>;
  roots: NodeId[];
  createdAt: string;
  updatedAt: string;
}

export function createEmptyDesign(id: string, name = 'Untitled design', now = new Date()): Design {
  const timestamp = now.toISOString();
  return {
    formatVersion: DESIGN_FORMAT_VERSION,
    id,
    name,
    units: 'mm',
    grid: { ...DEFAULT_GRID, size: [...DEFAULT_GRID.size] },
    nodes: {},
    roots: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
