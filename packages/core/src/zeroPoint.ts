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

/** Quarter turns (0 to 3) the zero point's L has been turned anticlockwise; a click on its corner adds one. */
export type ZeroTurns = 0 | 1 | 2 | 3;

export const nextTurn = (turns: ZeroTurns): ZeroTurns => ((turns + 1) % 4) as ZeroTurns;

const AXES: readonly (readonly [number, number])[] = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1],
];

/** The ends of the L's two arms (its x arm, then its y arm) on the floor, `length` mm long. */
export function zeroArms(origin: ZeroPoint, turns: ZeroTurns, length: number): [Vec3, Vec3] {
	const end = (axis: number): Vec3 => {
		const [dx, dy] = AXES[(axis + turns) % 4]!;
		return [origin[0] + dx * length, origin[1] + dy * length, 0];
	};
	return [end(0), end(1)];
}

/** +1 when the L's arm along the world `axis` points the positive way, -1 when it points against it: the sign readings take. */
export function zeroSign(turns: ZeroTurns, axis: 'x' | 'y'): 1 | -1 {
	const i = axis === 'x' ? 0 : 1;
	for (const arm of [0, 1]) {
		const d = AXES[(arm + turns) % 4]![i]!;
		if (d !== 0) return d as 1 | -1;
	}
	return 1;
}

/**
 * How far to move an object along the world `axis` so that its reading there is `reading` (what was typed, in mm, as the L
 * reads it): the face nearest the point goes to that distance on the side the L's arm points, so a positive reading lies along the arm.
 */
export function zeroMoveDelta(origin: ZeroPoint, bounds: Bounds, axis: 'x' | 'y', reading: number, turns: ZeroTurns): number {
	const i = axis === 'x' ? 0 : 1;
	const target = reading * zeroSign(turns, axis);
	const at = origin[i]! + target;
	return target >= 0 ? at - bounds.min[i]! : at - bounds.max[i]!;
}
