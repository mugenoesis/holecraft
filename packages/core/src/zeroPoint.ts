import type { Bounds, Vec3 } from './camera.ts';

/** The zero point: a spot on the floor that distances are measured from (x, y in mm). View state, never in the design. */
export type ZeroPoint = readonly [number, number];

/** A strip drawn on the floor between the zero point and the object. */
export interface ZeroStrip {
	axis: 'x' | 'y';
	from: Vec3;
	to: Vec3;
	/** Signed distance in mm along the axis. */
	length: number;
}

const gap = (origin: number, min: number, max: number) => (origin < min ? min - origin : origin > max ? max - origin : 0);

/** How far the object's nearest face is from the zero point along x and y (0 when the object spans it). */
export function zeroOffsets(origin: ZeroPoint, bounds: Bounds): { x: number; y: number } {
	return { x: gap(origin[0], bounds.min[0], bounds.max[0]), y: gap(origin[1], bounds.min[1], bounds.max[1]) };
}

/** The x strip runs at the object's near y edge, the y strip at its near x edge, so together they trace to its corner. */
export function zeroStrips(origin: ZeroPoint, bounds: Bounds): ZeroStrip[] {
	const { x, y } = zeroOffsets(origin, bounds);
	const nearX = origin[0] + x;
	const nearY = origin[1] + y;
	const strips: ZeroStrip[] = [];
	if (x !== 0) strips.push({ axis: 'x', from: [origin[0], nearY, 0], to: [nearX, nearY, 0], length: x });
	if (y !== 0) strips.push({ axis: 'y', from: [nearX, origin[1], 0], to: [nearX, nearY, 0], length: y });
	return strips;
}
