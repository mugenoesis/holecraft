export interface Point {
	x: number;
	y: number;
}

export interface TwoFingerStep {
	/** How far the middle between the fingers moved, in pixels. */
	pan: [number, number];
	/** Multiply the camera distance by this: below 1 zooms in (fingers spread), above 1 zooms out. */
	zoom: number;
}

const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const gap = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** What a two-finger gesture did between two moments: slide the view and/or pinch to zoom. */
export function twoFingerStep(before: readonly [Point, Point], after: readonly [Point, Point]): TwoFingerStep {
	const m0 = middle(before[0], before[1]);
	const m1 = middle(after[0], after[1]);
	const d0 = gap(before[0], before[1]);
	const d1 = gap(after[0], after[1]);
	// With the fingers (nearly) on top of each other the ratio means nothing, so leave the zoom alone.
	const zoom = d0 < 1 || d1 < 1 ? 1 : d0 / d1;
	return { pan: [m1.x - m0.x, m1.y - m0.y], zoom };
}
