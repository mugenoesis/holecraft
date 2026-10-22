import type { Vec3 } from '@holecraft/core';

/* X-ray: a way of looking into the design. Solids can be drawn see-through, and everything past a plane across one axis can be cut away to
   show the inside. It changes only how the view is drawn: never the design, the exports or the pictures kept for the designs list. */

export type CutAxis = 'x' | 'y' | 'z';
export interface Cut {
	axis: CutAxis;
	/** Where the plane is along the axis (mm): what is past it, further along the axis, is not drawn. */
	at: number;
}
export interface Xray {
	seeThrough: boolean;
	cut: Cut | null;
}

export const XRAY_OFF: Xray = { seeThrough: false, cut: null };

const AXIS_INDEX: Record<CutAxis, number> = { x: 0, y: 1, z: 2 };
type Box = { min: Vec3; max: Vec3 };

/** The design's extent along an axis, which is how far the plane can slide. A point for an empty design. */
export function cutRange(bounds: Box | null, axis: CutAxis): [number, number] {
	if (!bounds) return [0, 0];
	const k = AXIS_INDEX[axis];
	return [bounds.min[k]!, bounds.max[k]!];
}

/** A cut at the far end, where nothing is cut away yet, so the first slide takes off the top. */
export const defaultCut = (bounds: Box | null, axis: CutAxis): Cut => ({ axis, at: cutRange(bounds, axis)[1] });

/** The cut with its position kept within the design's extent (the far end for something that is not a number). */
export function clampCut(bounds: Box | null, cut: Cut): Cut {
	const [low, high] = cutRange(bounds, cut.axis);
	return { ...cut, at: Number.isFinite(cut.at) ? Math.min(high, Math.max(low, cut.at)) : high };
}

/** The plane as a normal and constant (`normal . p + constant`): kept where that is 0 or more, so what is at or before the cut stays. */
export function cutPlane(cut: Cut): { normal: Vec3; constant: number } {
	const normal: Vec3 = [0, 0, 0];
	normal[AXIS_INDEX[cut.axis]] = -1;
	return { normal, constant: cut.at };
}

/** What the editor's X-ray choices come to: off, or see-through and/or a cut kept inside the design. */
export function xrayFor(choice: { on: boolean; seeThrough: boolean; axis: CutAxis | null; at: number }, bounds: Box | null): Xray {
	if (!choice.on) return XRAY_OFF;
	return { seeThrough: choice.seeThrough, cut: choice.axis ? clampCut(bounds, { axis: choice.axis, at: choice.at }) : null };
}
