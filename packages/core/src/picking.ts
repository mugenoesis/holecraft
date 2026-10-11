import type { Vec3 } from './camera.ts';

/**
 * Where a ray meets the vertical plane through workplane point `at`, whose horizontal normal is
 * `normal` (any length). Used to read a height off the pointer. Null when the ray runs parallel
 * to the plane or the plane is behind the origin.
 */
export function rayVerticalPlaneIntersection(
  origin: Vec3,
  direction: Vec3,
  at: [number, number],
  normal: [number, number],
): Vec3 | null {
  const len = Math.hypot(normal[0], normal[1]);
  if (len < 1e-12) return null;
  const nx = normal[0] / len;
  const ny = normal[1] / len;
  const denom = nx * direction[0] + ny * direction[1];
  if (Math.abs(denom) < 1e-9) return null;
  const t = (nx * (at[0] - origin[0]) + ny * (at[1] - origin[1])) / denom;
  if (t <= 1e-9) return null;
  return [origin[0] + t * direction[0], origin[1] + t * direction[1], origin[2] + t * direction[2]];
}

/**
 * Where a ray meets the horizontal plane z = planeZ, or null when it is parallel to it,
 * the plane is behind the origin, or the origin already lies on the plane (an edge-on
 * view, where the pointer says nothing about where on the plane it is).
 */
export function rayPlaneIntersection(origin: Vec3, direction: Vec3, planeZ = 0): Vec3 | null {
  const dz = direction[2];
  if (Math.abs(dz) < 1e-12) return null;
  const t = (planeZ - origin[2]) / dz;
  if (t <= 1e-9) return null;
  return [origin[0] + t * direction[0], origin[1] + t * direction[1], planeZ];
}
