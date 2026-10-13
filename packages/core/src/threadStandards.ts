/**
 * The standard sizes of the threaded shapes: ISO metric, coarse pitch (the usual screw), the fit of a threaded hole or nut, and the
 * heads and nuts that go with them.
 *
 * A thread keeps its real size: an M5 is 5 mm across and rises 0.8 mm a turn at any length. So unlike the other shapes, a threaded
 * shape's width and depth come from its Size (and Fit and Head) and cannot be stretched, only its length (the height).
 */
export interface ThreadSize {
	/** What a shape stores for this size: a metric size's diameter (M5 is 5, so saved designs read as before), an inch size's 101 and up. */
	id: number;
	/** What the Size choice shows: "M5", "#10-24 UNC". */
	label: string;
	/** The Size choice groups the sizes by this. */
	group: 'Metric' | 'Inch (UNC)';
	/** The nominal (crest) diameter in mm: the number after the M, or the inch size converted. */
	diameter: number;
	/** How far the thread rises in one turn, in mm. */
	pitch: number;
	/** A nut's (and a standoff's) width across its flats: ISO 4032, ASME B18.6.3 and B18.2.2. */
	flats: number;
	/** A hex bolt head's width across its flats: ISO 4017, and for inch sizes ASME B18.6.3 hex machine screws (numbered sizes) or B18.2.1 hex cap screws. */
	headFlats: number;
	/** A hex bolt head's height. */
	headHeight: number;
	/** A nut's thickness. */
	nutHeight: number;
	/** A socket cap screw's head diameter (its height is the thread's diameter): ISO 4762. */
	capDiameter: number;
	/** A socket cap's hex socket, across flats and deep. */
	socketFlats: number;
	socketDepth: number;
	/** A washer's hole, outside diameter and thickness (ISO 7089). */
	washerInner: number;
	washerOuter: number;
	washerThickness: number;
}

type SizeData = Omit<ThreadSize, 'id' | 'label' | 'group' | 'headFlats'>;

const METRIC: readonly SizeData[] = [
	{
		diameter: 2,
		pitch: 0.4,
		flats: 4,
		headHeight: 1.4,
		nutHeight: 1.6,
		capDiameter: 3.8,
		socketFlats: 1.5,
		socketDepth: 1,
		washerInner: 2.2,
		washerOuter: 5,
		washerThickness: 0.3,
	},
	{
		diameter: 3,
		pitch: 0.5,
		flats: 5.5,
		headHeight: 2,
		nutHeight: 2.4,
		capDiameter: 5.5,
		socketFlats: 2.5,
		socketDepth: 1.3,
		washerInner: 3.2,
		washerOuter: 7,
		washerThickness: 0.5,
	},
	{
		diameter: 4,
		pitch: 0.7,
		flats: 7,
		headHeight: 2.8,
		nutHeight: 3.2,
		capDiameter: 7,
		socketFlats: 3,
		socketDepth: 2,
		washerInner: 4.3,
		washerOuter: 9,
		washerThickness: 0.8,
	},
	{
		diameter: 5,
		pitch: 0.8,
		flats: 8,
		headHeight: 3.5,
		nutHeight: 4,
		capDiameter: 8.5,
		socketFlats: 4,
		socketDepth: 2.5,
		washerInner: 5.3,
		washerOuter: 10,
		washerThickness: 1,
	},
	{
		diameter: 6,
		pitch: 1,
		flats: 10,
		headHeight: 4,
		nutHeight: 5,
		capDiameter: 10,
		socketFlats: 5,
		socketDepth: 3,
		washerInner: 6.4,
		washerOuter: 12,
		washerThickness: 1.6,
	},
	{
		diameter: 8,
		pitch: 1.25,
		flats: 13,
		headHeight: 5.3,
		nutHeight: 6.5,
		capDiameter: 13,
		socketFlats: 6,
		socketDepth: 4,
		washerInner: 8.4,
		washerOuter: 16,
		washerThickness: 1.6,
	},
	{
		diameter: 10,
		pitch: 1.5,
		flats: 16,
		headHeight: 6.4,
		nutHeight: 8,
		capDiameter: 16,
		socketFlats: 8,
		socketDepth: 5,
		washerInner: 10.5,
		washerOuter: 20,
		washerThickness: 2,
	},
	{
		diameter: 12,
		pitch: 1.75,
		flats: 18,
		headHeight: 7.5,
		nutHeight: 10,
		capDiameter: 18,
		socketFlats: 10,
		socketDepth: 6,
		washerInner: 13,
		washerOuter: 24,
		washerThickness: 2.5,
	},
];

/** ISO metric, coarse pitch: M2 to M12. */
export const THREAD_SIZES: readonly ThreadSize[] = METRIC.map((m) => ({
	...m,
	id: m.diameter,
	label: `M${m.diameter}`,
	group: 'Metric' as const,
	headFlats: m.flats,
}));

const inchesToMm = (inches: number) => inches * 25.4;

/**
 * Unified inch coarse (UNC), #4 to 1/2: the thread is 60 degrees like the metric one, so it is built the same way, with a pitch of 25.4 / threads
 * per inch. Dimensions are the nominal ones from ASME B18.2.2 (hex nuts, 1/4 and up) and B18.6.3 (machine screw nuts and hex machine screws, numbered
 * sizes), B18.2.1 (hex cap screws), B18.3 (socket head cap screws) and B18.21.1 (type B narrow flat washers), in inches converted to mm.
 */
const inch = (
	id: number,
	label: string,
	d: number,
	tpi: number,
	nut: [flats: number, thick: number],
	head: [flats: number, height: number],
	cap: [diameter: number, socket: number, engagement: number],
	washer: [inner: number, outer: number, thick: number],
): ThreadSize => ({
	id,
	label,
	group: 'Inch (UNC)',
	diameter: inchesToMm(d),
	pitch: inchesToMm(1 / tpi),
	flats: inchesToMm(nut[0]),
	nutHeight: inchesToMm(nut[1]),
	headFlats: inchesToMm(head[0]),
	headHeight: inchesToMm(head[1]),
	capDiameter: inchesToMm(cap[0]),
	socketFlats: inchesToMm(cap[1]),
	socketDepth: inchesToMm(cap[2]),
	washerInner: inchesToMm(washer[0]),
	washerOuter: inchesToMm(washer[1]),
	washerThickness: inchesToMm(washer[2]),
});

export const IMPERIAL_SIZES: readonly ThreadSize[] = [
	inch(101, '#4-40 UNC', 0.112, 40, [1 / 4, 3 / 32], [3 / 16, 0.055], [0.183, 3 / 32, 0.051], [0.123, 0.248, 0.032]),
	inch(102, '#6-32 UNC', 0.138, 32, [5 / 16, 7 / 64], [1 / 4, 0.087], [0.226, 7 / 64, 0.064], [0.154, 0.31, 0.032]),
	inch(103, '#8-32 UNC', 0.164, 32, [11 / 32, 1 / 8], [1 / 4, 0.103], [0.27, 9 / 64, 0.077], [0.19, 0.377, 0.04]),
	inch(104, '#10-24 UNC', 0.19, 24, [3 / 8, 1 / 8], [5 / 16, 0.112], [0.312, 5 / 32, 0.09], [0.205, 0.408, 0.04]),
	inch(105, '1/4-20 UNC', 1 / 4, 20, [7 / 16, 7 / 32], [7 / 16, 5 / 32], [0.375, 3 / 16, 0.12], [0.286, 0.505, 0.064]),
	inch(106, '5/16-18 UNC', 5 / 16, 18, [1 / 2, 17 / 64], [1 / 2, 13 / 64], [0.469, 1 / 4, 0.151], [0.349, 0.63, 0.064]),
	inch(107, '3/8-16 UNC', 3 / 8, 16, [9 / 16, 21 / 64], [9 / 16, 15 / 64], [0.562, 5 / 16, 0.182], [0.411, 0.738, 0.064]),
	inch(108, '1/2-13 UNC', 1 / 2, 13, [3 / 4, 7 / 16], [3 / 4, 5 / 16], [0.75, 3 / 8, 0.245], [0.536, 1.004, 0.064]),
];

/** Every size a thread can be, metric first. */
export const ALL_THREAD_SIZES: readonly ThreadSize[] = [...THREAD_SIZES, ...IMPERIAL_SIZES];

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

/** A standoff is female at both ends (a thread right through it), or male at one end: a stud under its body, and a thread blind into the other end. */
export const STANDOFF_TYPES = [
	{ value: 1, label: 'Female-female' },
	{ value: 2, label: 'Male-female' },
] as const;

/** The size a new thread starts as: M5, whose id is its diameter. */
export const DEFAULT_THREAD_DIAMETER = 5;
export const DEFAULT_STANDOFF_TYPE = 1;
/** A new standoff's body, in mm. */
export const DEFAULT_STANDOFF_LENGTH = 10;
export const DEFAULT_FIT = 2;
export const DEFAULT_HEAD = 1;

/** The size with this id (a metric size's diameter, or an inch size's 101 and up), or undefined if there is no such size. */
export const threadSize = (id: number): ThreadSize | undefined => ALL_THREAD_SIZES.find((s) => s.id === id);

/**
 * What a fastener is: the screw's thread, its hole (the cutter), a bolt (thread and head), a nut (a hex with the hole in it), a washer (a flat
 * ring, not threaded) or a standoff (a long hex nut, with a stud on one end if male).
 */
type Kind = 'rod' | 'hole' | 'bolt' | 'nut' | 'washer' | 'standoff';
const KINDS: Record<string, Kind> = {
	'threaded-rod': 'rod',
	'threaded-hole': 'hole',
	bolt: 'bolt',
	nut: 'nut',
	washer: 'washer',
	standoff: 'standoff',
};

/** Whether a shape is one of these fasteners, which keep their real size (width and depth from their settings; see `threadFootprint`). */
export const isThreadedType = (type: string): boolean => Object.hasOwn(KINDS, type);
/** Whether a fastener has a thread in it (all but the washer): what the Simple threads switch changes. */
export const hasThread = (type: string): boolean => Object.hasOwn(KINDS, type) && KINDS[type] !== 'washer';
export const threadKind = (type: string): Kind | undefined => KINDS[type];

export interface ThreadSettings {
	size: ThreadSize;
	/** How far the thread is opened out on every side: the fit, for a hole or nut. */
	clearance: number;
	/** 1 for a hex head, 2 for a socket cap (a bolt's). */
	head: number;
	/** 1 for a female standoff, 2 for a male one. */
	standoffType: number;
}

/** The size, clearance and head a threaded shape is built with, from its saved settings (anything unusable falls back to M5, Normal, Hex). */
export function threadSettings(type: string, params: Readonly<Record<string, unknown>>): ThreadSettings {
	const size = threadSize(Number(params.size)) ?? threadSize(DEFAULT_THREAD_DIAMETER)!;
	const fit = FITS.find((f) => f.value === Number(params.fit)) ?? FITS.find((f) => f.value === DEFAULT_FIT)!;
	const kind = KINDS[type];
	const head = HEADS.find((h) => h.value === Number(params.head))?.value ?? DEFAULT_HEAD;
	const standoffType = STANDOFF_TYPES.find((t) => t.value === Number(params.type))?.value ?? DEFAULT_STANDOFF_TYPE;
	return { size, clearance: kind === 'hole' || kind === 'nut' || kind === 'standoff' ? fit.clearance : 0, head, standoffType };
}

/** A hex measured across its corners, from its width across flats. */
export const acrossCorners = (flats: number): number => flats / Math.cos(Math.PI / 6);

const tidy = (n: number) => Math.round(n * 1e6) / 1e6;

/** How wide (x) and deep (y) a threaded shape is: the thread, or its head or nut (a hex has its corners on the x axis). */
export function threadFootprint(type: string, params: Readonly<Record<string, unknown>>): [number, number] {
	const { size, clearance, head } = threadSettings(type, params);
	const kind = KINDS[type];
	if (kind === 'washer') return [size.washerOuter, size.washerOuter];
	if (kind === 'nut' || kind === 'standoff') return [tidy(acrossCorners(size.flats)), size.flats];
	if (kind === 'bolt' && head === 1) return [tidy(acrossCorners(size.headFlats)), size.headFlats];
	if (kind === 'bolt') return [size.capDiameter, size.capDiameter];
	const across = tidy(size.diameter + 2 * clearance);
	return [across, across];
}

/** A male standoff's stud: twice the thread's diameter long. */
export const studLength = (size: ThreadSize): number => 2 * size.diameter;

/**
 * The part of a shape's height that is not its Length: a bolt's head (a hex head, or a socket cap as tall as it is wide) on top of its shank, or a
 * male standoff's stud under its body. 0 for the others.
 */
export function lengthOffset(type: string, params: Readonly<Record<string, unknown>>): number {
	const { size, head, standoffType } = threadSettings(type, params);
	if (KINDS[type] === 'bolt') return head === 1 ? size.headHeight : size.diameter;
	if (KINDS[type] === 'standoff' && standoffType === 2) return studLength(size);
	return 0;
}

/** The standard thickness of a nut or washer, or the least body a standoff can have: a nut's thickness, or twice the diameter for a male one (its thread is blind). */
function leastBody(type: string, params: Readonly<Record<string, unknown>>): number {
	const { size, standoffType } = threadSettings(type, params);
	return KINDS[type] === 'standoff' && standoffType === 2 ? 2 * size.diameter : size.nutHeight;
}

/** The least height a threaded shape can have: a bolt's head and a pitch of shank, a standoff's stud and the least body it can hold. */
export function minThreadHeight(type: string, params: Readonly<Record<string, unknown>>): number | null {
	if (KINDS[type] === 'bolt') return lengthOffset(type, params) + threadSettings(type, params).size.pitch;
	if (KINDS[type] === 'standoff') return lengthOffset(type, params) + leastBody(type, params);
	return null;
}

/**
 * `after` (a fastener's settings just changed from `before`) with the sizes that follow from them: the footprint, a bolt's or standoff's height
 * (keeping its shank or body length whatever head or type it has), and a nut's or washer's thickness, which goes back to the standard one when
 * its size changes. A height that is now too short is raised to the least.
 */
export function followSettings<P extends Record<string, unknown>>(type: string, before: P, after: P): P {
	const [width, depth] = threadFootprint(type, after);
	const out: Record<string, unknown> = { ...after, width, depth };
	const kind = KINDS[type];
	if (kind === 'bolt' || kind === 'standoff') out.height = Number(before.height) - lengthOffset(type, before) + lengthOffset(type, after);
	if (before.size !== after.size) {
		const { size } = threadSettings(type, after);
		if (kind === 'nut') out.height = size.nutHeight;
		if (kind === 'washer') out.height = size.washerThickness;
	}
	out.height = Math.max(Number(out.height), minThreadHeight(type, out) ?? 0);
	return out as P;
}

/** The size a new fastener starts at (the default settings): its footprint and height. `length` is a rod, hole or bolt's. */
export function defaultThreadSize(type: string, length: number): [number, number, number] {
	const [width, depth] = threadFootprint(type, {});
	const { size } = threadSettings(type, {});
	const kind = KINDS[type];
	if (kind === 'nut') return [width, depth, size.nutHeight];
	if (kind === 'washer') return [width, depth, size.washerThickness];
	if (kind === 'standoff') return [width, depth, DEFAULT_STANDOFF_LENGTH];
	return [width, depth, length + lengthOffset(type, {})];
}
