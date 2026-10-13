/**
 * The standard sizes of the threaded shapes: ISO metric, coarse pitch (the usual screw), the fit of a threaded hole or nut, and the
 * heads and nuts that go with them.
 *
 * A thread keeps its real size: an M5 is 5 mm across and rises 0.8 mm a turn at any length. So unlike the other shapes, a threaded
 * shape's width and depth come from its Size (and Fit and Head) and cannot be stretched, only its length (the height).
 */
export interface ThreadSize {
	/** The nominal (crest) diameter in mm: the number after the M. */
	diameter: number;
	/** How far the thread rises in one turn, in mm. */
	pitch: number;
	/** A hex head or nut's width across its flats (ISO 4017, 4032). */
	flats: number;
	/** A hex bolt head's height. */
	headHeight: number;
	/** A nut's thickness. */
	nutHeight: number;
	/** A socket cap screw's head diameter (its height is the thread's diameter): ISO 4762. */
	capDiameter: number;
	/** A socket cap's hex socket, across flats and deep. */
	socketFlats: number;
	socketDepth: number;
}

export const THREAD_SIZES: readonly ThreadSize[] = [
	{ diameter: 2, pitch: 0.4, flats: 4, headHeight: 1.4, nutHeight: 1.6, capDiameter: 3.8, socketFlats: 1.5, socketDepth: 1 },
	{ diameter: 3, pitch: 0.5, flats: 5.5, headHeight: 2, nutHeight: 2.4, capDiameter: 5.5, socketFlats: 2.5, socketDepth: 1.3 },
	{ diameter: 4, pitch: 0.7, flats: 7, headHeight: 2.8, nutHeight: 3.2, capDiameter: 7, socketFlats: 3, socketDepth: 2 },
	{ diameter: 5, pitch: 0.8, flats: 8, headHeight: 3.5, nutHeight: 4, capDiameter: 8.5, socketFlats: 4, socketDepth: 2.5 },
	{ diameter: 6, pitch: 1, flats: 10, headHeight: 4, nutHeight: 5, capDiameter: 10, socketFlats: 5, socketDepth: 3 },
	{ diameter: 8, pitch: 1.25, flats: 13, headHeight: 5.3, nutHeight: 6.5, capDiameter: 13, socketFlats: 6, socketDepth: 4 },
	{ diameter: 10, pitch: 1.5, flats: 16, headHeight: 6.4, nutHeight: 8, capDiameter: 16, socketFlats: 8, socketDepth: 5 },
	{ diameter: 12, pitch: 1.75, flats: 18, headHeight: 7.5, nutHeight: 10, capDiameter: 18, socketFlats: 10, socketDepth: 6 },
];

/** How much wider than its screw a threaded hole or nut is, in mm on every side: what a printer needs for the two to turn. */
export const FITS = [
	{ value: 1, label: 'Tight', clearance: 0.1 },
	{ value: 2, label: 'Normal', clearance: 0.2 },
	{ value: 3, label: 'Loose', clearance: 0.4 },
] as const;

/** The heads a bolt can have. */
export const HEADS = [
	{ value: 1, label: 'Hex' },
	{ value: 2, label: 'Socket cap' },
] as const;

export const DEFAULT_THREAD_DIAMETER = 5;
export const DEFAULT_FIT = 2;
export const DEFAULT_HEAD = 1;

/** The size with this nominal diameter, or undefined if there is no such size. */
export const threadSize = (diameter: number): ThreadSize | undefined => THREAD_SIZES.find((s) => s.diameter === diameter);

/** What a threaded shape is: the screw's thread, its hole (the cutter), a bolt (thread and head) or a nut (a hex with the hole in it). */
type Kind = 'rod' | 'hole' | 'bolt' | 'nut';
const KINDS: Record<string, Kind> = { 'threaded-rod': 'rod', 'threaded-hole': 'hole', bolt: 'bolt', nut: 'nut' };

export const isThreadedType = (type: string): boolean => Object.hasOwn(KINDS, type);
export const threadKind = (type: string): Kind | undefined => KINDS[type];

export interface ThreadSettings {
	size: ThreadSize;
	/** How far the thread is opened out on every side: the fit, for a hole or nut. */
	clearance: number;
	/** 1 for a hex head, 2 for a socket cap (a bolt's). */
	head: number;
}

/** The size, clearance and head a threaded shape is built with, from its saved settings (anything unusable falls back to M5, Normal, Hex). */
export function threadSettings(type: string, params: Readonly<Record<string, unknown>>): ThreadSettings {
	const size = threadSize(Number(params.size)) ?? threadSize(DEFAULT_THREAD_DIAMETER)!;
	const fit = FITS.find((f) => f.value === Number(params.fit)) ?? FITS.find((f) => f.value === DEFAULT_FIT)!;
	const kind = KINDS[type];
	const head = HEADS.find((h) => h.value === Number(params.head))?.value ?? DEFAULT_HEAD;
	return { size, clearance: kind === 'hole' || kind === 'nut' ? fit.clearance : 0, head };
}

/** A hex measured across its corners, from its width across flats. */
export const acrossCorners = (flats: number): number => flats / Math.cos(Math.PI / 6);

const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

/** How wide (x) and deep (y) a threaded shape is: the thread, or its head or nut (a hex has its corners on the x axis). */
export function threadFootprint(type: string, params: Readonly<Record<string, unknown>>): [number, number] {
	const { size, clearance, head } = threadSettings(type, params);
	const kind = KINDS[type];
	if (kind === 'nut' || (kind === 'bolt' && head === 1)) return [tidy(acrossCorners(size.flats)), size.flats];
	if (kind === 'bolt') return [size.capDiameter, size.capDiameter];
	const across = tidy(size.diameter + 2 * clearance);
	return [across, across];
}

/** A bolt's head height (a hex head, or a socket cap as tall as it is wide): the part of its height that is not shank. 0 for the others. */
export function lengthOffset(type: string, params: Readonly<Record<string, unknown>>): number {
	if (KINDS[type] !== 'bolt') return 0;
	const { size, head } = threadSettings(type, params);
	return head === 1 ? size.headHeight : size.diameter;
}

/** The least height a threaded shape can have: a bolt's head and a pitch of shank. */
export function minThreadHeight(type: string, params: Readonly<Record<string, unknown>>): number | null {
	return KINDS[type] === 'bolt' ? lengthOffset(type, params) + threadSettings(type, params).size.pitch : null;
}

/**
 * `after` (a threaded shape's settings just changed from `before`) with the sizes that follow from them: the footprint, a bolt's height
 * (keeping its shank length whatever head it has), and a nut's thickness, which goes back to the standard one when its size changes.
 */
export function followSettings<P extends Record<string, unknown>>(type: string, before: P, after: P): P {
	const [width, depth] = threadFootprint(type, after);
	const out: Record<string, unknown> = { ...after, width, depth };
	if (KINDS[type] === 'bolt') out.height = Number(before.height) - lengthOffset(type, before) + lengthOffset(type, after);
	if (KINDS[type] === 'nut' && before.size !== after.size) out.height = threadSettings(type, after).size.nutHeight;
	return out as P;
}

/** The size a new threaded shape starts at (the default settings): its footprint and height. */
export function defaultThreadSize(type: string, length: number): [number, number, number] {
	const [width, depth] = threadFootprint(type, {});
	const kind = KINDS[type];
	if (kind === 'nut') return [width, depth, threadSettings(type, {}).size.nutHeight];
	return [width, depth, length + lengthOffset(type, {})];
}
