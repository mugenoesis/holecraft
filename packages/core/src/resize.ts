import type { Vec3 } from './camera.ts';
import { MAX_SHAPE_SIZE } from './edit.ts';
import { snapToGrid } from './grid.ts';

/** A shape's footprint centre (x, y), base height z above the workplane, and its size, all in mm. */
export interface ShapeGeometry {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export type HandleId =
  | 'corner-pp'
  | 'corner-np'
  | 'corner-pn'
  | 'corner-nn'
  | 'side-px'
  | 'side-nx'
  | 'side-py'
  | 'side-ny'
  | 'height'
  | 'lift';

/** In `corner-pn`, `p` and `n` are the positive and negative X and Y sides. */
export const HANDLE_IDS: readonly HandleId[] = [
  'corner-pp',
  'corner-np',
  'corner-pn',
  'corner-nn',
  'side-px',
  'side-nx',
  'side-py',
  'side-ny',
  'height',
  'lift',
];

export const MIN_SHAPE_SIZE = 0.1;

export interface DragOptions {
  /** Grid step in mm; 0 turns snapping off. */
  snap: number;
  /** Scale all three dimensions together (corner and height handles). */
  uniform: boolean;
  /** Resize symmetrically about the centre instead of from the opposite side. */
  fromCenter: boolean;
}

const sign = (c: string): 1 | -1 => (c === 'p' ? 1 : -1);
const clampSize = (v: number) => Math.min(MAX_SHAPE_SIZE, Math.max(MIN_SHAPE_SIZE, v));
/** Rounds away float noise, and turns -0 into 0. */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

/** World position of a handle: corners and sides on the base, height and lift above the top face. */
export function handlePosition(g: ShapeGeometry, id: HandleId): Vec3 {
  if (id === 'height' || id === 'lift') return [g.x, g.y, g.z + g.height];
  if (id.startsWith('corner-')) return [g.x + (sign(id[7]!) * g.width) / 2, g.y + (sign(id[8]!) * g.depth) / 2, g.z];
  const s = sign(id[5]!);
  return id[6] === 'x' ? [g.x + (s * g.width) / 2, g.y, g.z] : [g.x, g.y + (s * g.depth) / 2, g.z];
}

/**
 * The geometry after dragging a handle to `target` (a world position, already corrected for
 * where on the handle it was grabbed). By default the opposite corner or side stays fixed and
 * the dragged edge snaps to the grid. The shape can shrink to a sliver but never flips or
 * passes through its fixed side.
 */
export function dragHandle(start: ShapeGeometry, id: HandleId, target: Vec3, opts: DragOptions): ShapeGeometry {
  const snap = (v: number) => snapToGrid(v, opts.snap);
  const { x, y, z, width: w, depth: d, height: h } = start;

  if (id === 'lift') {
    const lifted = Math.min(MAX_SHAPE_SIZE, Math.max(0, snap(target[2] - h)));
    return { ...start, z: tidy(lifted) };
  }

  if (id === 'height') {
    const height = clampSize(snap(target[2]) - z);
    if (!opts.uniform) return { ...start, height: tidy(height) };
    const s = height / h;
    return { ...start, width: tidy(clampSize(w * s)), depth: tidy(clampSize(d * s)), height: tidy(height) };
  }

  const px = snap(target[0]);
  const py = snap(target[1]);

  if (id.startsWith('side-')) {
    const s = sign(id[5]!);
    if (id[6] === 'x') {
      const r = axis(x, w, px, s, opts.fromCenter);
      return { ...start, x: tidy(r.centre), width: tidy(r.size) };
    }
    const r = axis(y, d, py, s, opts.fromCenter);
    return { ...start, y: tidy(r.centre), depth: tidy(r.size) };
  }

  const sx = sign(id[7]!);
  const sy = sign(id[8]!);
  let { centre: cx, size: width } = axis(x, w, px, sx, opts.fromCenter);
  let { centre: cy, size: depth } = axis(y, d, py, sy, opts.fromCenter);
  let height = h;

  if (opts.uniform) {
    const sw = width / w;
    const sd = depth / d;
    const raw = Math.abs(sw - 1) >= Math.abs(sd - 1) ? sw : sd;
    const s = Math.min(MAX_SHAPE_SIZE / Math.max(w, d, h), Math.max(MIN_SHAPE_SIZE / Math.min(w, d, h), raw));
    width = w * s;
    depth = d * s;
    height = h * s;
    if (!opts.fromCenter) {
      cx = x - (sx * w) / 2 + (sx * width) / 2;
      cy = y - (sy * d) / 2 + (sy * depth) / 2;
    }
  }

  return { x: tidy(cx), y: tidy(cy), z, width: tidy(width), depth: tidy(depth), height: tidy(height) };
}

/** One axis of a resize: where the centre and size end up when the `s` side is dragged to `p`. */
function axis(c: number, size: number, p: number, s: 1 | -1, fromCenter: boolean): { centre: number; size: number } {
  const fixed = fromCenter ? c : c - (s * size) / 2;
  const next = clampSize(fromCenter ? 2 * s * (p - c) : s * (p - fixed));
  return { centre: fromCenter ? c : fixed + (s * next) / 2, size: next };
}
