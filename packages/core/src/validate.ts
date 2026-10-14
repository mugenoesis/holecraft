import {
	type BaseNode,
	DESIGN_FORMAT_VERSION,
	type Design,
	type DesignNode,
	type EdgeTreatment,
	type GroupNode,
	MAX_NAME_LENGTH,
	type NodeId,
	type PaintFill,
	type ShapeNode,
	type SolidMode,
} from './design.ts';
import { MAX_SHAPE_SIZE } from './edit.ts';
import type { GridSettings } from './grid.ts';
import { MAX_STRETCH, MIN_STRETCH } from './groupFrame.ts';
import { isMeshRef, MESH_SHAPE_TYPE } from './meshShape.ts';
import { DEFAULT_PALETTE, isHexColor, MAX_PALETTE_SIZE } from './palette.ts';
import { isShapeType } from './shapes.ts';
import {
	isSketchSegment,
	MAX_SKETCH_COORDINATE,
	MAX_SKETCH_OUTLINES,
	MAX_SKETCH_POINTS,
	type Sketch,
	type SketchOutline,
	type SketchSegment,
} from './sketch.ts';
import { MAX_BULGE } from './sketchCurves.ts';

/** A saved design that cannot be trusted, with where in it the problem is. */
export class DesignValidationError extends Error {
	constructor(
		readonly path: string,
		problem: string,
	) {
		super(path ? `${path}: ${problem}` : problem);
		this.name = 'DesignValidationError';
	}
}

export const MAX_NODES = 5000;
export const MAX_GROUP_DEPTH = 64;
/** Names stored on disk may be somewhat longer than the editor produces, so older files still load. */
const MAX_STORED_NAME = 200;
const MAX_COORDINATE = 1e6;
const MAX_STRING_PARAM = 100;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fail(path: string, problem: string): never {
	throw new DesignValidationError(path, problem);
}

function str(v: unknown, path: string, max: number, { allowEmpty = false } = {}): string {
	if (typeof v !== 'string' || (!allowEmpty && v.length === 0) || v.length > max) fail(path, `must be a text of up to ${max} characters`);
	return v;
}

function bool(v: unknown, path: string): boolean {
	if (typeof v !== 'boolean') fail(path, 'must be true or false');
	return v;
}

function date(v: unknown): string {
	return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString();
}

function parseGrid(v: unknown): GridSettings {
	if (!isRecord(v)) fail('grid', 'must be an object');
	const size = v.size;
	if (!Array.isArray(size) || size.length !== 2 || !size.every((n) => isFiniteNumber(n) && n >= 10 && n <= 2000)) {
		fail('grid.size', 'must be two numbers between 10 and 2000 (width and depth in mm)');
	}
	if (!isFiniteNumber(v.snap) || v.snap < 0 || v.snap > 1000) fail('grid.snap', 'must be a number between 0 and 1000');
	return { size: [size[0] as number, size[1] as number], snap: v.snap };
}

function parseTransform(v: unknown, path: string): number[] {
	if (!Array.isArray(v) || v.length !== 16 || !v.every((n) => isFiniteNumber(n) && Math.abs(n) <= MAX_COORDINATE)) {
		fail(`${path}.transform`, `must be a transform: 16 finite numbers, none beyond ±${MAX_COORDINATE}`);
	}
	return [...(v as number[])];
}

type Raw = Record<string, unknown>;

export const MAX_EDGE_TREATMENTS = 1000;
const MAX_EDGE_POINTS = 4097;
const MAX_TREATMENT_ID = 64;

function parsePoint(v: unknown, path: string): [number, number, number] {
	if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => isFiniteNumber(n) && Math.abs(n) <= MAX_COORDINATE)) {
		fail(path, `must be a point: three finite numbers, none beyond ±${MAX_COORDINATE}`);
	}
	return [v[0] as number, v[1] as number, v[2] as number];
}

function parseDirection(v: unknown, path: string): [number, number, number] {
	const p = parsePoint(v, path);
	if (Math.abs(Math.hypot(...p) - 1) > 1e-3) fail(path, 'must be a direction (a vector of length 1)');
	return p;
}

function parseTreatment(raw: unknown, path: string): EdgeTreatment {
	if (!isRecord(raw)) fail(path, 'must be an object');
	const id = str(raw.id, `${path}.id`, MAX_TREATMENT_ID);
	if (raw.kind !== 'chamfer' && raw.kind !== 'round') fail(`${path}.kind`, 'must be "chamfer" or "round"');
	if (!isFiniteNumber(raw.size) || raw.size <= 0 || raw.size > MAX_SHAPE_SIZE)
		fail(`${path}.size`, `must be a number above 0 and up to ${MAX_SHAPE_SIZE}`);
	if (!Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > MAX_EDGE_POINTS) {
		fail(`${path}.points`, `must be a list of 2 to ${MAX_EDGE_POINTS} points`);
	}
	const points = raw.points.map((p, i) => parsePoint(p, `${path}.points.${i}`));
	if (!Array.isArray(raw.normals) || raw.normals.length !== points.length - 1)
		fail(`${path}.normals`, 'must give two face directions per segment');
	const normals = raw.normals.map((pair, i) => {
		if (!Array.isArray(pair) || pair.length !== 2) fail(`${path}.normals.${i}`, 'must be two face directions');
		return [parseDirection(pair[0], `${path}.normals.${i}.0`), parseDirection(pair[1], `${path}.normals.${i}.1`)] as [
			[number, number, number],
			[number, number, number],
		];
	});
	return { id, kind: raw.kind, size: raw.size, points, normals };
}

/** A node's edge treatments, or undefined for none (the field is then left out). */
function parseTreatments(raw: unknown, path: string): EdgeTreatment[] | undefined {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw) || raw.length > MAX_EDGE_TREATMENTS)
		fail(`${path}.edges`, `must be a list of up to ${MAX_EDGE_TREATMENTS} edge treatments`);
	const list = raw.map((t, i) => parseTreatment(t, `${path}.edges.${i}`));
	const ids = new Set(list.map((t) => t.id));
	if (ids.size !== list.length) fail(`${path}.edges`, 'each treatment needs its own id');
	return list.length ? list : undefined;
}

const MAX_PAINT_FILLS = 1000;

const MAX_BRUSH_DABS = 300;
const MAX_BRUSH_RADIUS = 500;

function parseBrush(raw: Raw, path: string, id: string, color: string | null): PaintFill {
	const { shape, radius, dabs } = raw;
	if (shape !== 'circle' && shape !== 'sphere' && shape !== 'triangle') fail(`${path}.shape`, 'must be "circle", "sphere" or "triangle"');
	if (!(isFiniteNumber(radius) && radius > 0 && radius <= MAX_BRUSH_RADIUS))
		fail(`${path}.radius`, `must be a number above 0 and up to ${MAX_BRUSH_RADIUS}`);
	if (!Array.isArray(dabs) || dabs.length < 1 || dabs.length > MAX_BRUSH_DABS)
		fail(`${path}.dabs`, `must be a list of 1 to ${MAX_BRUSH_DABS} dabs`);
	const list = dabs.map((d, i) => {
		if (!isRecord(d)) fail(`${path}.dabs.${i}`, 'must be an object');
		return { point: parsePoint(d.point, `${path}.dabs.${i}.point`), normal: parseDirection(d.normal, `${path}.dabs.${i}.normal`) };
	});
	return { id, kind: 'brush', color, shape, radius, dabs: list };
}

const MAX_BAND_HEIGHT = 1000;
const MAX_GAP_AREA = 1000;

function parseBand(raw: Raw, path: string, id: string, color: string | null): PaintFill {
	const { height } = raw;
	if (!(isFiniteNumber(height) && height > 0 && height <= MAX_BAND_HEIGHT))
		fail(`${path}.height`, `must be a number above 0 and up to ${MAX_BAND_HEIGHT}`);
	return { id, kind: 'band', color, origin: parsePoint(raw.origin, `${path}.origin`), up: parseDirection(raw.up, `${path}.up`), height };
}

function parseGaps(raw: Raw, path: string, id: string): PaintFill {
	const { area } = raw;
	if (!(isFiniteNumber(area) && area >= 0 && area <= MAX_GAP_AREA)) fail(`${path}.area`, `must be a number from 0 to ${MAX_GAP_AREA}`);
	return { id, kind: 'gaps', color: null, area };
}

function parseRegion(raw: Raw, path: string, id: string, color: string | null): PaintFill {
	const { spread, angle } = raw;
	if (spread !== undefined && spread !== 'smart' && spread !== 'bucket') fail(`${path}.spread`, 'must be "smart" or "bucket"');
	if (angle !== undefined && !(isFiniteNumber(angle) && angle >= 0 && angle <= 90)) fail(`${path}.angle`, 'must be a number from 0 to 90');
	return {
		id,
		kind: 'region',
		color,
		point: parsePoint(raw.point, `${path}.point`),
		normal: parseDirection(raw.normal, `${path}.normal`),
		...(spread !== undefined && { spread }),
		...(angle !== undefined && { angle }),
	};
}

function parsePaintFill(raw: unknown, path: string): PaintFill {
	if (!isRecord(raw)) fail(path, 'must be an object');
	const id = str(raw.id, `${path}.id`, MAX_TREATMENT_ID);
	const colorOf = (allowNone: boolean): string | null => {
		if (allowNone && raw.color === null) return null;
		if (typeof raw.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) fail(`${path}.color`, 'must be a #rrggbb colour');
		return raw.color.toLowerCase();
	};
	if (raw.kind === 'body') return { id, kind: 'body', color: colorOf(false)! };
	if (raw.kind === 'gaps') return parseGaps(raw, path, id);
	if (raw.kind !== 'region' && raw.kind !== 'brush' && raw.kind !== 'band')
		fail(`${path}.kind`, 'must be "region", "brush", "band", "gaps" or "body"');
	const color = colorOf(true);
	if (raw.kind === 'brush') return parseBrush(raw, path, id, color);
	if (raw.kind === 'band') return parseBand(raw, path, id, color);
	return parseRegion(raw, path, id, color);
}

/** A node's paint, or undefined for none (the field is then left out). */
function parsePaint(raw: unknown, path: string): PaintFill[] | undefined {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw) || raw.length > MAX_PAINT_FILLS) fail(`${path}.paint`, `must be a list of up to ${MAX_PAINT_FILLS} paint fills`);
	const list = raw.map((f, i) => parsePaintFill(f, `${path}.paint.${i}`));
	if (new Set(list.map((f) => f.id)).size !== list.length) fail(`${path}.paint`, 'each fill needs its own id');
	return list.length ? list : undefined;
}

/** The fields every node has, whatever its kind. */
function parseBase(key: string, raw: Raw, path: string): BaseNode {
	if (raw.id !== key) fail(`${path}.id`, `must match the key "${key}"`);
	const mode = raw.mode;
	if (mode !== 'solid' && mode !== 'hole') fail(`${path}.mode`, 'must be "solid" or "hole"');
	if (typeof raw.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw.color)) fail(`${path}.color`, 'must be a #rrggbb colour');

	const edges = parseTreatments(raw.edges, path);
	const paint = parsePaint(raw.paint, path);
	return {
		id: key,
		name: str(raw.name, `${path}.name`, MAX_STORED_NAME),
		transform: parseTransform(raw.transform, path),
		mode: mode as SolidMode,
		color: raw.color.toLowerCase(),
		hidden: bool(raw.hidden, `${path}.hidden`),
		locked: bool(raw.locked, `${path}.locked`),
		...(edges && { edges }),
		...(paint && { paint }),
	};
}

/** A shape's parameters: width, depth and height are required and bounded; other simple values are kept. */
function parseShapeParams(rawParams: unknown, path: string): Record<string, number | string | boolean> {
	if (!isRecord(rawParams)) fail(`${path}.params`, 'must be an object');
	const params: Record<string, number | string | boolean> = {};
	for (const dim of ['width', 'depth', 'height']) {
		const v = rawParams[dim];
		if (!isFiniteNumber(v) || v <= 0 || v > MAX_SHAPE_SIZE)
			fail(`${path}.params.${dim}`, `${dim} must be a number above 0 and up to ${MAX_SHAPE_SIZE}`);
		params[dim] = v;
	}
	for (const [name, v] of Object.entries(rawParams)) {
		if (name in params) continue;
		if (isFiniteNumber(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= MAX_STRING_PARAM)) params[name] = v;
	}
	return params;
}

/** One outline: its points, and the kind of each side if any is curved (one per point). */
function parseOutline(outline: unknown, where: string): SketchOutline {
	if (!isRecord(outline) || !Array.isArray(outline.points) || outline.points.length < 2 || outline.points.length > MAX_SKETCH_POINTS)
		fail(where, `must be an outline of 2 to ${MAX_SKETCH_POINTS} points`);
	const points = outline.points.map((p, k) => {
		const ok = Array.isArray(p) && p.length === 2 && p.every((n) => isFiniteNumber(n) && Math.abs(n) <= MAX_SKETCH_COORDINATE);
		if (!ok) fail(`${where}.points.${k}`, `must be a point: two finite numbers, none beyond ±${MAX_SKETCH_COORDINATE}`);
		return [(p as number[])[0]!, (p as number[])[1]!] as [number, number];
	});
	const segments = outline.segments === undefined ? undefined : parseSegments(outline.segments, points.length, where);
	if (points.length < 3 && !segments?.some((kind) => kind !== 'line'))
		fail(where, 'must be an outline of 3 or more points (2 when a side is curved)');
	return { points, ...(segments && { segments }) };
}

/** The kinds of side of an outline: one per point, each a line, a smooth curve, or an arc by its bulge. */
function parseSegments(raw: unknown, count: number, where: string): SketchSegment[] {
	if (!Array.isArray(raw) || raw.length !== count) fail(`${where}.segments`, 'must give the kind of each side, one for each point');
	return raw.map((kind, k) => {
		if (!isSketchSegment(kind)) fail(`${where}.segments.${k}`, `must be a side: "line", "curve" or an arc's bulge up to ${MAX_BULGE}`);
		return kind;
	});
}

/** A sketch shape's drawing: 1 to 64 outlines of 3 to 512 points each. Not recentred: that is for whoever makes the drawing. */
function parseSketch(raw: unknown, path: string): Sketch {
	if (!isRecord(raw) || !Array.isArray(raw.outlines)) fail(`${path}.sketch`, 'a sketch shape needs a sketch with a list of outlines');
	if (raw.outlines.length < 1 || raw.outlines.length > MAX_SKETCH_OUTLINES)
		fail(`${path}.sketch.outlines`, `must have 1 to ${MAX_SKETCH_OUTLINES} outlines`);
	const outlines = raw.outlines.map((outline, i) => parseOutline(outline, `${path}.sketch.outlines.${i}`));
	return { outlines };
}

function parseShape(base: BaseNode, raw: Raw, path: string): ShapeNode {
	const shapeType = raw.shapeType;
	if (typeof shapeType !== 'string' || (shapeType !== MESH_SHAPE_TYPE && !isShapeType(shapeType)))
		fail(`${path}.shapeType`, 'is not a known shape');
	const params = parseShapeParams(raw.params, path);
	// An imported model must point at a stored mesh by a proper reference: it becomes a file name.
	if (shapeType === MESH_SHAPE_TYPE && !isMeshRef(params.mesh))
		fail(`${path}.params.mesh`, 'an imported model needs a valid mesh reference');
	// only a sketch shape has a drawing (and it must have one); on anything else the field is dropped
	const sketch = shapeType === 'sketch' ? parseSketch(raw.sketch, path) : undefined;
	return { ...base, kind: 'shape', shapeType, params, ...(sketch && { sketch }) };
}

/** A group's stretch: three positive numbers within limits, or nothing (all 1 is the same as none, so it is left out). */
function parseStretch(v: unknown, path: string): [number, number, number] | undefined {
	if (v === undefined) return undefined;
	if (
		!Array.isArray(v) ||
		v.length !== 3 ||
		!v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= MIN_STRETCH && n <= MAX_STRETCH)
	)
		fail(path, `must be three numbers from ${MIN_STRETCH} to ${MAX_STRETCH}`);
	const scale = v as [number, number, number];
	return scale.every((n) => n === 1) ? undefined : scale;
}

function parseGroup(base: BaseNode, raw: Raw, path: string): GroupNode {
	if (!Array.isArray(raw.children) || !raw.children.every((c) => typeof c === 'string'))
		fail(`${path}.children`, 'must be a list of node ids');
	if (raw.op !== 'union' && raw.op !== 'intersect') fail(`${path}.op`, 'must be "union" or "intersect"');
	const scale = parseStretch(raw.scale, `${path}.scale`);
	return {
		...base,
		kind: 'group',
		children: [...(raw.children as string[])],
		op: raw.op,
		multicolor: bool(raw.multicolor, `${path}.multicolor`),
		...(scale && { scale }),
	};
}

function parseNode(key: string, raw: unknown): DesignNode {
	const path = `nodes.${key}`;
	if (!isRecord(raw)) fail(path, 'must be an object');
	const base = parseBase(key, raw, path);

	switch (raw.kind) {
		case 'shape':
			return parseShape(base, raw, path);
		case 'group':
			return parseGroup(base, raw, path);
		case 'mesh':
			return { ...base, kind: 'mesh', meshRef: str(raw.meshRef, `${path}.meshRef`, MAX_STRING_PARAM) };
		default:
			fail(`${path}.kind`, 'must be "shape", "group" or "mesh"');
	}
}

/** Format migrations, oldest first. Add an entry here whenever DESIGN_FORMAT_VERSION is raised. */
const MIGRATIONS: Record<number, (design: Record<string, unknown>) => Record<string, unknown>> = {
	// 1 -> 2: designs gain a palette of filament colours.
	1: (design) => ({ ...design, palette: [...DEFAULT_PALETTE] }),
	// 2 -> 3: nodes may carry edge treatments (chamfers and rounds on chosen edges). Nothing to change in older files.
	2: (design) => design,
	// 3 -> 4: nodes may carry paint (fills on the surface). Nothing to change in older files.
	3: (design) => design,
	// 4 -> 5: shapes may be sketches (a drawing extruded). Nothing to change in older files.
	4: (design) => design,
	// 5 -> 6: a sketch's sides may be arcs or smooth curves (`segments`). Nothing to change in older files.
	5: (design) => design,
	// 6 -> 7: a group may carry a stretch along its own axes (`scale`). Nothing to change in older files.
	6: (design) => design,
};

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
	const version = raw.formatVersion;
	if (!Number.isInteger(version) || (version as number) < 1) fail('formatVersion', 'must be a whole number, 1 or more');
	if ((version as number) > DESIGN_FORMAT_VERSION) fail('formatVersion', 'this design was made by a newer version of Holecraft');
	let current = raw;
	for (let v = version as number; v < DESIGN_FORMAT_VERSION; v++) current = MIGRATIONS[v]!(current);
	return current;
}

function parsePalette(v: unknown): string[] {
	if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PALETTE_SIZE)
		fail('palette', `must be a list of 1 to ${MAX_PALETTE_SIZE} colours`);
	const colours: string[] = [];
	v.forEach((c, i) => {
		if (!isHexColor(c)) fail(`palette[${i}]`, 'must be a #rrggbb colour');
		const lower = c.toLowerCase();
		if (!colours.includes(lower)) colours.push(lower);
	});
	return colours;
}

/**
 * Checks untrusted data (a file on disk, a request body) and returns a clean Design built from it.
 * Nothing is taken on trust: unknown properties are dropped, sizes and coordinates are bounded,
 * and the node tree must be a proper tree. Nodes nothing refers to are discarded. Throws
 * DesignValidationError, saying where, if the design cannot be used.
 */
export function parseDesign(input: unknown): Design {
	if (!isRecord(input)) fail('', 'a design must be an object');
	const raw = migrate(input);

	const units = raw.units;
	if (units !== 'mm' && units !== 'in') fail('units', 'must be "mm" or "in"');
	if (!isRecord(raw.nodes)) fail('nodes', 'must be an object');
	if (!Array.isArray(raw.roots) || !raw.roots.every((r) => typeof r === 'string')) fail('roots', 'must be a list of node ids');

	const keys = Object.keys(raw.nodes);
	if (keys.length > MAX_NODES) fail('nodes', `too many nodes (the limit is ${MAX_NODES})`);
	const parsed: Record<NodeId, DesignNode> = {};
	for (const key of keys) parsed[key] = parseNode(key, raw.nodes[key]);

	// Walk the tree from the roots. Every node may appear once, so it is a tree and cannot loop.
	const reached: Record<NodeId, DesignNode> = {};
	const visit = (id: NodeId, path: string, depth: number) => {
		const node = parsed[id];
		if (!node) fail(path, `refers to missing node "${id}"`);
		if (id in reached) fail(path, `node "${id}" is used more than once (it already has a parent)`);
		if (depth > MAX_GROUP_DEPTH) fail(path, `groups are nested too deeply (the limit is ${MAX_GROUP_DEPTH})`);
		reached[id] = node;
		if (node.kind === 'group') {
			for (const [i, child] of node.children.entries()) visit(child, `nodes.${id}.children[${i}]`, depth + 1);
		}
	};

	const roots = raw.roots as string[];
	const seenRoots = new Set<string>();
	roots.forEach((id, i) => {
		if (seenRoots.has(id)) fail(`roots[${i}]`, `node "${id}" is listed twice (duplicate root)`);
		seenRoots.add(id);
		visit(id, `roots[${i}]`, 0);
	});

	return {
		formatVersion: DESIGN_FORMAT_VERSION,
		palette: parsePalette(raw.palette),
		id: str(raw.id, 'id', 64),
		name: str(raw.name, 'name', MAX_STORED_NAME, { allowEmpty: true }),
		units,
		grid: parseGrid(raw.grid),
		nodes: reached,
		roots: [...roots],
		createdAt: date(raw.createdAt),
		updatedAt: date(raw.updatedAt),
	};
}

/** Renames a design: trimmed, limited in length, and left alone if blank or unchanged. */
export function renameDesign(design: Design, name: string, now?: Date): Design {
	const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
	if (!trimmed || trimmed === design.name) return design;
	return { ...design, name: trimmed, updatedAt: (now ?? new Date()).toISOString() };
}
