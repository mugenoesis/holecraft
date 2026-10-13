import { FONTS } from './text.ts';
import { DEFAULT_FONT, DEFAULT_TEXT, defaultTextSize } from './textShape.ts';
import {
	ALL_THREAD_SIZES,
	DEFAULT_FIT,
	DEFAULT_HEAD,
	DEFAULT_STANDOFF_TYPE,
	DEFAULT_THREAD_DIAMETER,
	defaultThreadSize,
	FITS,
	HEADS,
	STANDOFF_TYPES,
} from './threadStandards.ts';

export type ShapeType =
	| 'box'
	| 'cylinder'
	| 'sphere'
	| 'cone'
	| 'pyramid'
	| 'wedge'
	| 'roof'
	| 'round-roof'
	| 'half-sphere'
	| 'tube'
	| 'torus'
	| 'hexagon'
	| 'star'
	| 'polygon'
	| 'threaded-rod'
	| 'threaded-hole'
	| 'bolt'
	| 'nut'
	| 'washer'
	| 'standoff'
	| 'text'
	| 'sketch';

/**
 * One setting a shape has besides its size (the Properties panel makes a field for each). It is kept as a share of the shape (0.3 is 30% of
 * the radius), so the whole shape, setting included, stretches evenly when it is resized and nothing about it breaks; the field shows and takes mm.
 */
export interface ParamDef {
	/** Where it is kept in the node's params. */
	key: string;
	label: string;
	/** For a setting that is picked from a list (a thread's size): the values it can take and what they are called. Stored as the value. */
	choices?: readonly { value: number; label: string; group?: string }[];
	/** The share (or count) it starts at. */
	default: number;
	/** The least share (or count) it may be. */
	min: number;
	/** The most share (or count) it may be: a wall can never fill the whole tube. */
	max: number;
	/** A whole number of things (a polygon's sides) rather than a share of the shape: it is rounded, does not change with the size, and the field shows it as it is (`mmPerUnit` is 1). */
	count?: boolean;
	/** How many mm a share of 1 is for a shape of this width, depth and height: what the Properties field shows and takes. */
	mmPerUnit: (size: readonly [number, number, number]) => number;
}

export type ShapeCategory = 'basic' | 'parametric' | 'fasteners';

export interface ShapeDef {
	id: ShapeType;
	/** Which group of the Shapes panel it is in (the chips). */
	category: ShapeCategory;
	/** Other words it can be found by in the panel's search ("ring" finds a torus). */
	keywords: readonly string[];
	name: string;
	/** Width (X), depth (Y), height (Z) in mm. */
	defaultSize: [number, number, number];
	color: string;
	/** A thread keeps its real size: its width and depth come from its settings (see threadFootprint) and cannot be changed, only its length (the height). */
	fixedFootprint?: true;
	/** Starts as a hole, not a solid. */
	hole?: true;
	/** Has no tile in the Shapes panel (and is not found by its search): it is made some other way, as a sketch is by drawing it. */
	noTile?: true;
	/** Settings it starts with besides its size and its `params` defaults: a text's words. */
	initial?: Readonly<Record<string, string | number>>;
	/** Settings besides the size. A shape with some is built at its real size from them (see parametricMesh), not stretched from a unit mesh. */
	params?: readonly ParamDef[];
}

const SIZE_CHOICES = ALL_THREAD_SIZES.map((t) => ({ value: t.id, label: t.label, group: t.group }));
const HEAD_CHOICES = HEADS.map((h) => ({ value: h.value, label: h.label }));
const TYPE_CHOICES = STANDOFF_TYPES.map((t) => ({ value: t.value, label: t.label }));
const FONT_CHOICES = FONTS.map((f) => ({ value: f.id, label: f.label }));
const FIT_CHOICES = FITS.map((f) => ({ value: f.value, label: f.label }));

/**
 * Built-in shapes. Each is built into a unit-sized mesh whose base sits on z=0 and is
 * scaled by its width/depth/height params, so the document only stores sizes.
 */
type BaseDef = Omit<ShapeDef, 'category' | 'keywords'>;

const BASE_DEFS: readonly BaseDef[] = [
	{ id: 'box', name: 'Box', defaultSize: [20, 20, 20], color: '#f28c28' },
	{ id: 'cylinder', name: 'Cylinder', defaultSize: [20, 20, 20], color: '#2a9d8f' },
	{ id: 'sphere', name: 'Sphere', defaultSize: [20, 20, 20], color: '#e76f51' },
	{ id: 'cone', name: 'Cone', defaultSize: [20, 20, 20], color: '#8d99ae' },
	{ id: 'pyramid', name: 'Pyramid', defaultSize: [20, 20, 20], color: '#f28c28' },
	{ id: 'wedge', name: 'Wedge', defaultSize: [20, 20, 20], color: '#2a9d8f' },
	{ id: 'roof', name: 'Roof', defaultSize: [20, 20, 20], color: '#e76f51' },
	{ id: 'round-roof', name: 'Round Roof', defaultSize: [20, 20, 20], color: '#8d99ae' },
	{ id: 'half-sphere', name: 'Half Sphere', defaultSize: [20, 20, 20], color: '#f28c28' },
	{
		id: 'tube',
		name: 'Tube',
		defaultSize: [20, 20, 20],
		color: '#2a9d8f',
		// the wall is a share of the narrower radius: 0.3 of 10 mm is the 3 mm a 20 mm tube starts with
		params: [{ key: 'wall', label: 'Wall thickness', default: 0.3, min: 0.02, max: 0.95, mmPerUnit: ([w, d]) => Math.min(w, d) / 2 }],
	},
	{
		id: 'torus',
		name: 'Torus',
		defaultSize: [30, 30, 10],
		color: '#e76f51',
		// the ring's tube is a share of the narrower side: a third of 30 mm is the 10 mm a 30 mm torus starts with (at most 0.45, so a hole is left)
		params: [{ key: 'thickness', label: 'Ring thickness', default: 1 / 3, min: 0.02, max: 0.45, mmPerUnit: ([w, d]) => Math.min(w, d) }],
	},
	{ id: 'hexagon', name: 'Hexagon', defaultSize: [20, 17.32, 20], color: '#8d99ae' },
	{
		id: 'star',
		name: 'Star',
		defaultSize: [20, 19.02, 10],
		color: '#f28c28',
		// the inner radius is a share of the half-width: 0.4 of 10 mm is the 4 mm a 20 mm wide star starts with
		params: [{ key: 'inner', label: 'Inner radius', default: 0.4, min: 0.1, max: 0.9, mmPerUnit: ([w]) => w / 2 }],
	},
	{
		id: 'polygon',
		name: 'Polygon',
		defaultSize: [19.02, 18.09, 20],
		color: '#e76f51',
		// a regular pentagon of radius 10 mm fills 19.02 x 18.09 mm; other counts are stretched to the same box
		params: [{ key: 'sides', label: 'Sides', count: true, default: 5, min: 3, max: 32, mmPerUnit: () => 1 }],
	},
	{
		id: 'threaded-rod',
		name: 'Threaded Rod',
		defaultSize: defaultThreadSize('threaded-rod', 20),
		color: '#8d99ae',
		fixedFootprint: true,
		params: [{ key: 'size', label: 'Size', choices: SIZE_CHOICES, default: DEFAULT_THREAD_DIAMETER, min: 2, max: 108, mmPerUnit: () => 1 }],
	},
	{
		id: 'threaded-hole',
		name: 'Threaded Hole',
		// M5 opened out by the Normal fit's 0.2 mm on every side
		defaultSize: defaultThreadSize('threaded-hole', 10),
		color: '#8d99ae',
		fixedFootprint: true,
		hole: true,
		params: [
			{ key: 'size', label: 'Size', choices: SIZE_CHOICES, default: DEFAULT_THREAD_DIAMETER, min: 2, max: 108, mmPerUnit: () => 1 },
			{ key: 'fit', label: 'Fit', choices: FIT_CHOICES, default: DEFAULT_FIT, min: 1, max: 3, mmPerUnit: () => 1 },
		],
	},
	{
		id: 'bolt',
		name: 'Bolt',
		// an M5 hex bolt with a 20 mm shank under its 3.5 mm head
		defaultSize: defaultThreadSize('bolt', 20),
		color: '#e76f51',
		fixedFootprint: true,
		params: [
			{ key: 'size', label: 'Size', choices: SIZE_CHOICES, default: DEFAULT_THREAD_DIAMETER, min: 2, max: 108, mmPerUnit: () => 1 },
			{ key: 'head', label: 'Head', choices: HEAD_CHOICES, default: DEFAULT_HEAD, min: 1, max: 2, mmPerUnit: () => 1 },
		],
	},
	{
		id: 'nut',
		name: 'Nut',
		// an M5 nut, 4 mm thick
		defaultSize: defaultThreadSize('nut', 0),
		color: '#2a9d8f',
		fixedFootprint: true,
		params: [
			{ key: 'size', label: 'Size', choices: SIZE_CHOICES, default: DEFAULT_THREAD_DIAMETER, min: 2, max: 108, mmPerUnit: () => 1 },
			{ key: 'fit', label: 'Fit', choices: FIT_CHOICES, default: DEFAULT_FIT, min: 1, max: 3, mmPerUnit: () => 1 },
		],
	},
	{
		id: 'washer',
		name: 'Washer',
		// an M5 washer, 10 mm across and 1 mm thick
		defaultSize: defaultThreadSize('washer', 0),
		color: '#8d99ae',
		fixedFootprint: true,
		params: [{ key: 'size', label: 'Size', choices: SIZE_CHOICES, default: DEFAULT_THREAD_DIAMETER, min: 2, max: 108, mmPerUnit: () => 1 }],
	},
	{
		id: 'standoff',
		name: 'Standoff',
		// an M5 female standoff, 10 mm long
		defaultSize: defaultThreadSize('standoff', 0),
		color: '#f28c28',
		fixedFootprint: true,
		params: [
			{ key: 'size', label: 'Size', choices: SIZE_CHOICES, default: DEFAULT_THREAD_DIAMETER, min: 2, max: 108, mmPerUnit: () => 1 },
			{ key: 'type', label: 'Ends', choices: TYPE_CHOICES, default: DEFAULT_STANDOFF_TYPE, min: 1, max: 2, mmPerUnit: () => 1 },
			{ key: 'fit', label: 'Fit', choices: FIT_CHOICES, default: DEFAULT_FIT, min: 1, max: 3, mmPerUnit: () => 1 },
		],
	},
	{
		id: 'text',
		name: 'Text',
		// the words "Text", at 10 mm to the em, 3 mm thick
		defaultSize: defaultTextSize(),
		color: '#2a9d8f',
		initial: { text: DEFAULT_TEXT },
		params: [{ key: 'font', label: 'Font', choices: FONT_CHOICES, default: DEFAULT_FONT, min: 1, max: 4, mmPerUnit: () => 1 }],
	},
	{
		// made by the Sketch tool, which gives it its drawing and size; this is only what a damaged or empty one falls back to
		id: 'sketch',
		name: 'Sketch',
		defaultSize: [20, 20, 10],
		color: '#e76f51',
		noTile: true,
	},
];

/** Where each shape sits in the panel, and what else it is called. */
const PANEL: Record<ShapeType, { category: ShapeCategory; keywords: readonly string[] }> = {
	box: { category: 'basic', keywords: ['cube', 'block', 'square'] },
	cylinder: { category: 'basic', keywords: ['round', 'can', 'rod'] },
	sphere: { category: 'basic', keywords: ['ball', 'round'] },
	cone: { category: 'basic', keywords: ['point', 'funnel'] },
	pyramid: { category: 'basic', keywords: ['triangle', 'point'] },
	wedge: { category: 'basic', keywords: ['ramp', 'slope', 'triangle'] },
	roof: { category: 'basic', keywords: ['house', 'ridge', 'triangle'] },
	'round-roof': { category: 'basic', keywords: ['arch', 'half pipe'] },
	'half-sphere': { category: 'basic', keywords: ['dome', 'hemisphere', 'bowl'] },
	hexagon: { category: 'basic', keywords: ['six sides', 'prism'] },
	tube: { category: 'parametric', keywords: ['pipe', 'ring', 'hollow'] },
	torus: { category: 'parametric', keywords: ['ring', 'donut', 'o-ring'] },
	star: { category: 'parametric', keywords: ['five', 'points'] },
	polygon: { category: 'parametric', keywords: ['pentagon', 'sides', 'regular'] },
	'threaded-rod': { category: 'fasteners', keywords: ['screw', 'thread', 'stud', 'metric', 'inch'] },
	'threaded-hole': { category: 'fasteners', keywords: ['screw', 'thread', 'tap', 'cutter'] },
	bolt: { category: 'fasteners', keywords: ['screw', 'thread', 'head', 'fastener'] },
	nut: { category: 'fasteners', keywords: ['hex', 'thread', 'fastener'] },
	washer: { category: 'fasteners', keywords: ['ring', 'flat', 'fastener'] },
	standoff: { category: 'fasteners', keywords: ['spacer', 'hex', 'thread', 'fastener'] },
	text: { category: 'parametric', keywords: ['letters', 'words', 'label', 'name', 'sign', 'font', 'type'] },
	sketch: { category: 'parametric', keywords: ['draw', 'outline', 'extrude', '2d'] },
};

export const SHAPE_DEFS: readonly ShapeDef[] = BASE_DEFS.map((d) => ({ ...d, ...PANEL[d.id] }));

export function isShapeType(value: string): value is ShapeType {
	return SHAPE_DEFS.some((d) => d.id === value);
}

export function getShapeDef(type: ShapeType): ShapeDef {
	const def = SHAPE_DEFS.find((d) => d.id === type);
	if (!def) throw new Error(`Unknown shape type: ${type}`);
	return def;
}
