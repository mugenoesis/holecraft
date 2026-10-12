import type { Vec3 } from './camera.ts';
import { mmToUnits, type Units } from './units.ts';

/** Measuring between two points in the view (the ruler): pure maths, nothing here changes a design. */

export interface Measurement {
	/** b - a on each axis, in mm. */
	delta: Vec3;
	/** Straight-line distance in mm. */
	distance: number;
}

export function measureBetween(a: Vec3, b: Vec3): Measurement {
	const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
	return { delta, distance: Math.hypot(...delta) };
}

const round = (v: number, step: number) => Math.round(v / step) * step + 0; // + 0 turns -0 into 0
const hundredth = (v: number) => Math.round(v * 100) / 100 + 0; // dividing last avoids float noise like 7.890000000000001

/**
 * Where a ruler click lands. On the bare workplane (z = 0, facing up) x and y snap to the grid so
 * distances come out round; anywhere else the point stays exactly where it hit, rounded to 0.01 mm.
 */
export function snapMeasuredPoint(point: Vec3, normal: Vec3, snap: number): Vec3 {
	const onWorkplane = Math.abs(point[2]) < 1e-6 && normal[2] > 0.99;
	if (onWorkplane && snap > 0) return [round(point[0], snap), round(point[1], snap), 0];
	return [hundredth(point[0]), hundredth(point[1]), hundredth(point[2])];
}

/** "12.35 mm" / "0.5 in": a length in mm shown in the design's units with at most two decimals. */
export function formatLength(mm: number, units: Units): string {
	return `${Number(mmToUnits(mm, units).toFixed(2))} ${units}`;
}

/** The ruler's two points: nothing yet, a start, or a finished measurement. */
export interface RulerState {
	a: Vec3 | null;
	b: Vec3 | null;
}

/** What a click at `point` does: set the start, then the end, then begin again. */
export function nextRuler(state: RulerState, point: Vec3): RulerState {
	return state.a && !state.b ? { a: state.a, b: point } : { a: point, b: null };
}
