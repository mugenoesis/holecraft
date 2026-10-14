import type { HandleId, ShapeGeometry, Vec3 } from '@holecraft/core';
import type { Viewport } from './Viewport.ts';

/**
 * Where a pointer is aiming a resize or lift handle. The four ways a handle can be dragged:
 * - `floor`: a side or corner of a shape that stands level, aimed at the workplane at its base height;
 * - `vertical`: height and lift of a level shape, aimed at the vertical plane facing the camera;
 * - `plane`: a side or corner of a tipped shape, aimed at the plane of its own base;
 * - `axis`: the height handle of a tipped shape, aimed at its own up axis.
 * A tipped shape's lift handle is `vertical` too, over the handle's own spot rather than the base centre.
 */
export type AimKind = 'floor' | 'vertical' | 'plane' | 'axis';

/** What the pointer is aiming at: the shape as the drag began, its turn, and where the handle was. */
export interface Aim {
	kind: AimKind;
	start: ShapeGeometry;
	/** The shape's row-major turn: its own up axis is the third column. */
	rotation: readonly number[];
	/** Where the handle was when it was grabbed. */
	at: Vec3;
}

type Pointer = { clientX: number; clientY: number };

export function aimKind(id: HandleId, tilted: boolean): AimKind {
	if (id === 'lift') return 'vertical';
	if (id === 'height') return tilted ? 'axis' : 'vertical';
	return tilted ? 'plane' : 'floor';
}

const baseCentre = (a: Aim): Vec3 => [a.start.x, a.start.y, a.start.z];
const upAxis = (a: Aim): Vec3 => [a.rotation[2]!, a.rotation[5]!, a.rotation[8]!];
/** The spot on the floor the vertical plane passes through: under the handle for a tipped shape's lift, else the base centre. */
const verticalAt = (a: Aim, id: HandleId, tilted: boolean): [number, number] =>
	tilted && id === 'lift' ? [a.at[0], a.at[1]] : [a.start.x, a.start.y];

/** The raw spot a pointer reads on what the handle is aimed at: a point, a height, a distance along the axis, or null. */
function read(vp: Viewport, a: Aim, id: HandleId, tilted: boolean, e: Pointer): Vec3 | number | null {
	switch (a.kind) {
		case 'floor': {
			const hit = vp.pickWorkplane(e.clientX, e.clientY, a.start.z);
			return hit && [hit[0], hit[1], a.start.z];
		}
		case 'vertical':
			return vp.pickHeight(e.clientX, e.clientY, verticalAt(a, id, tilted));
		case 'plane':
			return vp.pickPlane(e.clientX, e.clientY, baseCentre(a), upAxis(a));
		case 'axis':
			return vp.pickAlongAxis(e.clientX, e.clientY, baseCentre(a), upAxis(a));
	}
}

/** The gap between the handle and where the pointer first touched it, so the handle does not jump to the pointer. */
export function aimOffset(vp: Viewport, a: Aim, id: HandleId, tilted: boolean, e: Pointer): Vec3 {
	const touched = read(vp, a, id, tilted, e);
	if (touched === null) return [0, 0, 0];
	if (typeof touched === 'number') return a.kind === 'axis' ? [0, 0, a.start.height - touched] : [0, 0, a.at[2] - touched];
	return a.kind === 'plane'
		? [a.at[0] - touched[0], a.at[1] - touched[1], a.at[2] - touched[2]]
		: [a.at[0] - touched[0], a.at[1] - touched[1], 0];
}

/** The world point the pointer is dragging the handle towards (what the drag maths takes), or null if it points nowhere useful. */
export function aimTarget(vp: Viewport, a: Aim, id: HandleId, tilted: boolean, offset: Vec3, e: Pointer): Vec3 | null {
	const touched = read(vp, a, id, tilted, e);
	if (touched === null) return null;
	if (typeof touched === 'number') {
		if (a.kind === 'axis') {
			const up = upAxis(a);
			const o = baseCentre(a);
			return [o[0] + up[0] * (touched + offset[2]), o[1] + up[1] * (touched + offset[2]), o[2] + up[2] * (touched + offset[2])];
		}
		const [x, y] = verticalAt(a, id, tilted);
		return [x, y, touched + offset[2]];
	}
	return [touched[0] + offset[0], touched[1] + offset[1], a.kind === 'plane' ? touched[2] + offset[2] : a.start.z];
}
