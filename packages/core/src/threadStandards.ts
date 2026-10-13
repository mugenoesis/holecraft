/**
 * The standard sizes of the threaded shapes: ISO metric, coarse pitch (the usual screw), and the fit of a threaded hole.
 *
 * A thread keeps its real size whatever is dragged: an M5 is 5 mm across and rises 0.8 mm a turn at any length. So unlike the other
 * shapes, a threaded shape's width and depth come from its Size (and Fit) and cannot be stretched, only its length (the height).
 */
export interface ThreadSize {
	/** The nominal (crest) diameter in mm: the number after the M. */
	diameter: number;
	/** How far the thread rises in one turn, in mm. */
	pitch: number;
}

export const THREAD_SIZES: readonly ThreadSize[] = [
	{ diameter: 2, pitch: 0.4 },
	{ diameter: 3, pitch: 0.5 },
	{ diameter: 4, pitch: 0.7 },
	{ diameter: 5, pitch: 0.8 },
	{ diameter: 6, pitch: 1 },
	{ diameter: 8, pitch: 1.25 },
	{ diameter: 10, pitch: 1.5 },
	{ diameter: 12, pitch: 1.75 },
];

/** How much wider than its screw a threaded hole is, in mm on every side: what a printer needs for the two to turn. */
export const FITS = [
	{ value: 1, label: 'Tight', clearance: 0.1 },
	{ value: 2, label: 'Normal', clearance: 0.2 },
	{ value: 3, label: 'Loose', clearance: 0.4 },
] as const;

export const DEFAULT_THREAD_DIAMETER = 5;
export const DEFAULT_FIT = 2;

/** The size with this nominal diameter, or undefined if there is no such size. */
export const threadSize = (diameter: number): ThreadSize | undefined => THREAD_SIZES.find((s) => s.diameter === diameter);

/** The shapes that are a thread, and whether each is the hole that a screw goes into (opened out by its fit). */
const THREADED: Record<string, { hole: boolean }> = { 'threaded-rod': { hole: false }, 'threaded-hole': { hole: true } };

export const isThreadedType = (type: string): boolean => Object.hasOwn(THREADED, type);

/** The size and clearance a threaded shape is built with, from its saved settings (anything unusable falls back to M5, Normal). */
export function threadSettings(type: string, params: Readonly<Record<string, unknown>>): { size: ThreadSize; clearance: number } {
	const size = threadSize(Number(params.size)) ?? threadSize(DEFAULT_THREAD_DIAMETER)!;
	const fit = FITS.find((f) => f.value === Number(params.fit)) ?? FITS.find((f) => f.value === DEFAULT_FIT)!;
	return { size, clearance: THREADED[type]?.hole ? fit.clearance : 0 };
}

/** How wide and deep a threaded shape is: its crest diameter, plus the clearance on each side for a hole. */
export function threadFootprint(type: string, params: Readonly<Record<string, unknown>>): number {
	const { size, clearance } = threadSettings(type, params);
	return Math.round((size.diameter + 2 * clearance) * 1e9) / 1e9;
}
