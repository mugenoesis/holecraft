import { clampToWorkplane, type Design, snapOnPlane, snapToGrid, type Vec3, type WorkPlane } from '@holecraft/core';
import type { Viewport } from './Viewport.ts';

/** Where a shape is put down: its base centre on the floor, or on a Workplane-tool plane. */
export type PlacementTarget = { at: [number, number] } | { plane: WorkPlane; point: Vec3 };

/**
 * Where a shape would be put down for a pointer at (x, y) on screen: on the floor, kept inside the plate and snapped to the grid, or on the
 * chosen plane (snapped there). Null when the pointer is over the sky, or misses the plane. A drop from the panel and the ghost of a
 * shape being placed both ask this, so they agree.
 */
export function placementTarget(
	viewport: Pick<Viewport, 'pickWorkplane' | 'pickPlane'>,
	x: number,
	y: number,
	grid: Design['grid'],
	plane: WorkPlane | null,
): PlacementTarget | null {
	if (plane) {
		const on = viewport.pickPlane(x, y, plane.origin, plane.normal);
		return on ? { plane, point: snapOnPlane(plane, on, grid.snap) } : null;
	}
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
