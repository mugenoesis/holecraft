import type { Vec3 } from './camera.ts';

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
