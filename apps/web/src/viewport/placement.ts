import { clampToWorkplane, type Design, isUsablePlane, snapOnPlane, snapToGrid, type Vec3, type WorkPlane } from '@holecraft/core';
import type { Viewport } from './Viewport.ts';

/** Where a shape is put down: its base centre on the floor, or on a Workplane-tool plane. */
export type PlacementTarget = { at: [number, number] } | { plane: WorkPlane; point: Vec3 };

/** Rounds away float noise (and -0) from a picked point. */
const tidy = (v: Vec3): Vec3 => v.map((n) => Math.round(n * 1e6) / 1e6 + 0) as Vec3;

/**
 * Standing on a face: the plane of the face, snapped to the world grid (the plane's zero is where the world's origin lies on it, so the grid on
 * a top face is the floor's grid carried up), and the point on it nearest the pointer. Null for an underside, which nothing can stand on.
 */
function faceTarget(point: Vec3, normal: Vec3, snap: number): PlacementTarget | null {
	if (!isUsablePlane(normal)) return null;
	const along = normal[0] * point[0] + normal[1] * point[1] + normal[2] * point[2];
	const plane: WorkPlane = { origin: tidy([normal[0] * along, normal[1] * along, normal[2] * along]), normal };
	return { plane, point: tidy(snapOnPlane(plane, point, snap)) };
}

/**
 * Where a shape would be put down for a pointer at (x, y) on screen: on the Workplane tool's plane when one is chosen (snapped there), else
 * on the face of a shape under the pointer (its top or a side), else on the floor, kept inside the plate and snapped to the grid. Null when
 * the pointer is over the sky, or misses the plane. A drop from the panel and the ghost of a shape being placed both ask this, so they agree.
 */
export function placementTarget(
	viewport: Pick<Viewport, 'pickWorkplane' | 'pickPlane' | 'pickSurface'>,
	x: number,
	y: number,
	grid: Design['grid'],
	plane: WorkPlane | null,
): PlacementTarget | null {
	if (plane) {
		const on = viewport.pickPlane(x, y, plane.origin, plane.normal);
		return on ? { plane, point: snapOnPlane(plane, on, grid.snap) } : null;
	}
	const surface = viewport.pickSurface(x, y);
	const face = surface?.id === undefined ? null : faceTarget(surface.point, surface.normal, grid.snap);
	if (face) return face;
	const hit = viewport.pickWorkplane(x, y);
	if (!hit) return null;
	const [cx, cy] = clampToWorkplane(hit, grid.size);
	return { at: [snapToGrid(cx, grid.snap), snapToGrid(cy, grid.snap)] };
}

/**
 * Whether a click on a shape in the panel arms it to be placed by clicking the plate: a mouse and a pen can aim, a finger cannot (a tap
 * adds the shape straight away), and a click with no pointer behind it (the keyboard) has nothing to aim with either.
 */
export function armsOnClick(pointerType: string): boolean {
	return pointerType === 'mouse' || pointerType === 'pen';
}

/** Whether a screen point is inside a rectangle (a finger lifted over the view puts a shape down; over anything else it lets go). */
export function inside(rect: { left: number; top: number; right: number; bottom: number }, x: number, y: number): boolean {
	return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
