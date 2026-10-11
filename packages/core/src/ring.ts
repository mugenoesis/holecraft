import type { Vec3 } from './camera.ts';
import type { Axis } from './rotation.ts';

/** Geometry for the rotation rings: one circle per world axis, centred on the shape. */

export function axisVector(axis: Axis): Vec3 {
  return axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
}

/**
 * In-plane basis for a ring, in the order that makes increasing angles turn counter-clockwise
 * about the axis (x: Y→Z, y: Z→X, z: X→Y), matching the rotation matrices.
 */
function basis(axis: Axis): [Vec3, Vec3] {
  if (axis === 'x') return [[0, 1, 0], [0, 0, 1]];
  if (axis === 'y') return [[0, 0, 1], [1, 0, 0]];
  return [[1, 0, 0], [0, 1, 0]];
}

export function ringPoint(center: Vec3, axis: Axis, radius: number, angle: number): Vec3 {
  const [u, v] = basis(axis);
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  return [center[0] + c * u[0] + s * v[0], center[1] + c * u[1] + s * v[1], center[2] + c * u[2] + s * v[2]];
}

/** Angle of `point` around the ring (radians). Distance from the centre and off-plane offset are ignored. */
export function ringAngle(center: Vec3, axis: Axis, point: Vec3): number {
  const [u, v] = basis(axis);
  const d = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
  return Math.atan2(d[0]! * v[0] + d[1]! * v[1] + d[2]! * v[2], d[0]! * u[0] + d[1]! * u[1] + d[2]! * u[2]);
}

/** Wraps an angle into (-π, π], so a pointer crossing the seam turns the short way. */
export function normalizeAngle(a: number): number {
  const wrapped = ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Rounds an angle in degrees to the nearest `step` degrees (0 = no snapping). */
export function snapAngle(degrees: number, step: number): number {
  return step > 0 ? Math.round(degrees / step) * step + 0 : degrees;
}

/** Where a ray meets the plane through `point` with normal `normal` (any length), or null. */
export function rayAnyPlaneIntersection(origin: Vec3, direction: Vec3, point: Vec3, normal: Vec3): Vec3 | null {
  const len = Math.hypot(...normal);
  if (len < 1e-12) return null;
  const n = normal.map((v) => v / len) as Vec3;
  const denom = n[0] * direction[0] + n[1] * direction[1] + n[2] * direction[2];
  if (Math.abs(denom) < 1e-9) return null;
  const t = (n[0] * (point[0] - origin[0]) + n[1] * (point[1] - origin[1]) + n[2] * (point[2] - origin[2])) / denom;
  if (t <= 1e-9) return null;
  return [origin[0] + t * direction[0], origin[1] + t * direction[1], origin[2] + t * direction[2]];
}
