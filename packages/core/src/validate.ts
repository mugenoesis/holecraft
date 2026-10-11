import {
  DESIGN_FORMAT_VERSION,
  MAX_NAME_LENGTH,
  type Design,
  type DesignNode,
  type NodeId,
  type SolidMode,
} from './design.ts';
import { MAX_SHAPE_SIZE } from './edit.ts';
import type { GridSettings } from './grid.ts';
import { isMeshRef, MESH_SHAPE_TYPE } from './meshShape.ts';
import { DEFAULT_PALETTE, MAX_PALETTE_SIZE, isHexColor } from './palette.ts';
import { isShapeType } from './shapes.ts';

/** A saved design that cannot be trusted, with where in it the problem is. */
export class DesignValidationError extends Error {
  constructor(
    readonly path: string,
    problem: string,
  ) {
    super(path ? `${path}: ${problem}` : problem);
    this.name = 'DesignValidationError';
  }
}

export const MAX_NODES = 5000;
export const MAX_GROUP_DEPTH = 64;
/** Names stored on disk may be somewhat longer than the editor produces, so older files still load. */
const MAX_STORED_NAME = 200;
const MAX_COORDINATE = 1e6;
const MAX_STRING_PARAM = 100;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fail(path: string, problem: string): never {
  throw new DesignValidationError(path, problem);
}

function str(v: unknown, path: string, max: number, { allowEmpty = false } = {}): string {
  if (typeof v !== 'string' || (!allowEmpty && v.length === 0) || v.length > max) fail(path, `must be a text of up to ${max} characters`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'must be true or false');
  return v;
}

function date(v: unknown): string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString();
}

function parseGrid(v: unknown): GridSettings {
  if (!isRecord(v)) fail('grid', 'must be an object');
  const size = v.size;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => isFiniteNumber(n) && n >= 10 && n <= 2000)) {
    fail('grid.size', 'must be two numbers between 10 and 2000 (width and depth in mm)');
  }
  if (!isFiniteNumber(v.snap) || v.snap < 0 || v.snap > 1000) fail('grid.snap', 'must be a number between 0 and 1000');
  return { size: [size[0] as number, size[1] as number], snap: v.snap };
}

function parseTransform(v: unknown, path: string): number[] {
  if (!Array.isArray(v) || v.length !== 16 || !v.every((n) => isFiniteNumber(n) && Math.abs(n) <= MAX_COORDINATE)) {
    fail(`${path}.transform`, `must be a transform: 16 finite numbers, none beyond ±${MAX_COORDINATE}`);
  }
  return [...(v as number[])];
}

function parseNode(key: string, raw: unknown): DesignNode {
  const path = `nodes.${key}`;
  if (!isRecord(raw)) fail(path, 'must be an object');
  if (raw.id !== key) fail(`${path}.id`, `must match the key "${key}"`);

  const mode = raw.mode;
  if (mode !== 'solid' && mode !== 'hole') fail(`${path}.mode`, 'must be "solid" or "hole"');
  if (typeof raw.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) fail(`${path}.color`, 'must be a #rrggbb colour');

  const base = {
    id: key,
    name: str(raw.name, `${path}.name`, MAX_STORED_NAME),
    transform: parseTransform(raw.transform, path),
    mode: mode as SolidMode,
    color: raw.color.toLowerCase(),
    hidden: bool(raw.hidden, `${path}.hidden`),
    locked: bool(raw.locked, `${path}.locked`),
  };

  switch (raw.kind) {
    case 'shape': {
      if (typeof raw.shapeType !== 'string' || (raw.shapeType !== MESH_SHAPE_TYPE && !isShapeType(raw.shapeType))) fail(`${path}.shapeType`, 'is not a known shape');
      if (!isRecord(raw.params)) fail(`${path}.params`, 'must be an object');
      const params: Record<string, number | string | boolean> = {};
      for (const dim of ['width', 'depth', 'height']) {
        const v = raw.params[dim];
        if (!isFiniteNumber(v) || v <= 0 || v > MAX_SHAPE_SIZE) fail(`${path}.params.${dim}`, `${dim} must be a number above 0 and up to ${MAX_SHAPE_SIZE}`);
        params[dim] = v;
      }
      for (const [name, v] of Object.entries(raw.params)) {
        if (name in params) continue;
        if (isFiniteNumber(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= MAX_STRING_PARAM)) params[name] = v;
      }
      // An imported model must point at a stored mesh by a proper reference: it becomes a file name.
      if (raw.shapeType === MESH_SHAPE_TYPE && !isMeshRef(params.mesh)) fail(`${path}.params.mesh`, 'an imported model needs a valid mesh reference');
      return { ...base, kind: 'shape', shapeType: raw.shapeType, params };
    }
    case 'group': {
      if (!Array.isArray(raw.children) || !raw.children.every((c) => typeof c === 'string')) fail(`${path}.children`, 'must be a list of node ids');
      if (raw.op !== 'union' && raw.op !== 'intersect') fail(`${path}.op`, 'must be "union" or "intersect"');
      return { ...base, kind: 'group', children: [...(raw.children as string[])], op: raw.op, multicolor: bool(raw.multicolor, `${path}.multicolor`) };
    }
    case 'mesh':
      return { ...base, kind: 'mesh', meshRef: str(raw.meshRef, `${path}.meshRef`, MAX_STRING_PARAM) };
    default:
      fail(`${path}.kind`, 'must be "shape", "group" or "mesh"');
  }
}

/** Format migrations, oldest first. Add an entry here whenever DESIGN_FORMAT_VERSION is raised. */
const MIGRATIONS: Record<number, (design: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 -> 2: designs gain a palette of filament colours.
  1: (design) => ({ ...design, palette: [...DEFAULT_PALETTE] }),
};

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = raw.formatVersion;
  if (!Number.isInteger(version) || (version as number) < 1) fail('formatVersion', 'must be a whole number, 1 or more');
  if ((version as number) > DESIGN_FORMAT_VERSION) fail('formatVersion', 'this design was made by a newer version of Holecraft');
  let current = raw;
  for (let v = version as number; v < DESIGN_FORMAT_VERSION; v++) current = MIGRATIONS[v]!(current);
  return current;
}

function parsePalette(v: unknown): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PALETTE_SIZE) fail('palette', `must be a list of 1 to ${MAX_PALETTE_SIZE} colours`);
  const colours: string[] = [];
  v.forEach((c, i) => {
    if (!isHexColor(c)) fail(`palette[${i}]`, 'must be a #rrggbb colour');
    const lower = c.toLowerCase();
    if (!colours.includes(lower)) colours.push(lower);
  });
  return colours;
}

/**
 * Checks untrusted data (a file on disk, a request body) and returns a clean Design built from it.
 * Nothing is taken on trust: unknown properties are dropped, sizes and coordinates are bounded,
 * and the node tree must be a proper tree. Nodes nothing refers to are discarded. Throws
 * DesignValidationError, saying where, if the design cannot be used.
 */
export function parseDesign(input: unknown): Design {
  if (!isRecord(input)) fail('', 'a design must be an object');
  const raw = migrate(input);

  const units = raw.units;
  if (units !== 'mm' && units !== 'in') fail('units', 'must be "mm" or "in"');
  if (!isRecord(raw.nodes)) fail('nodes', 'must be an object');
  if (!Array.isArray(raw.roots) || !raw.roots.every((r) => typeof r === 'string')) fail('roots', 'must be a list of node ids');

  const keys = Object.keys(raw.nodes);
  if (keys.length > MAX_NODES) fail('nodes', `too many nodes (the limit is ${MAX_NODES})`);
  const parsed: Record<NodeId, DesignNode> = {};
  for (const key of keys) parsed[key] = parseNode(key, raw.nodes[key]);

  // Walk the tree from the roots. Every node may appear once, so it is a tree and cannot loop.
  const reached: Record<NodeId, DesignNode> = {};
  const visit = (id: NodeId, path: string, depth: number) => {
    const node = parsed[id];
    if (!node) fail(path, `refers to missing node "${id}"`);
    if (id in reached) fail(path, `node "${id}" is used more than once (it already has a parent)`);
    if (depth > MAX_GROUP_DEPTH) fail(path, `groups are nested too deeply (the limit is ${MAX_GROUP_DEPTH})`);
    reached[id] = node;
    if (node.kind === 'group') node.children.forEach((child, i) => visit(child, `nodes.${id}.children[${i}]`, depth + 1));
  };

  const roots = raw.roots as string[];
  const seenRoots = new Set<string>();
  roots.forEach((id, i) => {
    if (seenRoots.has(id)) fail(`roots[${i}]`, `node "${id}" is listed twice (duplicate root)`);
    seenRoots.add(id);
    visit(id, `roots[${i}]`, 0);
  });

  return {
    formatVersion: DESIGN_FORMAT_VERSION,
    palette: parsePalette(raw.palette),
    id: str(raw.id, 'id', 64),
    name: str(raw.name, 'name', MAX_STORED_NAME, { allowEmpty: true }),
    units,
    grid: parseGrid(raw.grid),
    nodes: reached,
    roots: [...roots],
    createdAt: date(raw.createdAt),
    updatedAt: date(raw.updatedAt),
  };
}

/** Renames a design: trimmed, limited in length, and left alone if blank or unchanged. */
export function renameDesign(design: Design, name: string, now?: Date): Design {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed || trimmed === design.name) return design;
  return { ...design, name: trimmed, updatedAt: (now ?? new Date()).toISOString() };
}
