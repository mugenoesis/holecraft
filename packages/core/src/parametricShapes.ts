import type { Design, NodeId, ShapeNode } from './design.ts';
import { MAX_SHAPE_SIZE } from './limits.ts';
import type { MeshData } from './meshShape.ts';
import { getShapeDef, isShapeType, type ParamDef } from './shapes.ts';
import { outwards } from './solidShapes.ts';
import { isThreadedType, threadFootprint, threadSettings } from './threadStandards.ts';

/**
 * Shapes built from their settings (the tube's wall, the torus's ring).
 *
 * A setting is kept in `params` as a **share** of the shape (see ParamDef), so the whole shape stretches evenly when it is resized:
 * a tube made twice as big has a wall twice as thick, its hole stays in proportion, and chamfers on it stretch exactly with it, so
 * nothing about it breaks once it is made. What was typed is kept and limited to what fits only when the shape is built, so shrinking
 * a shape and growing it back loses nothing. The Properties field shows and takes mm for the shape's current size.
 *
 * The same mesh is drawn in the view and given to the CSG engine, as for a chamfer.
 */

/** Facets round a tube or ring, and round a ring's own cross-section. */
const SEGMENTS = 64;
const RING_SEGMENTS = 24;

const sizeOf = (node: ShapeNode): [number, number, number] => [
	Number(node.params.width),
	Number(node.params.depth),
	Number(node.params.height),
];

/** The definition of a shape's setting, or null if the shape (or the setting) doesn't exist. */
function paramDef(shapeType: string, key: string): ParamDef | null {
	return (isShapeType(shapeType) ? getShapeDef(shapeType).params : undefined)?.find((p) => p.key === key) ?? null;
}

/** What was typed for a setting (as a share), or its default if nothing usable was. */
function typedShare(node: ShapeNode, def: ParamDef): number {
	const typed = node.params[def.key];
	return typeof typed === 'number' && Number.isFinite(typed) ? typed : def.default;
}

/** A setting's value for a shape, as a share: what was typed (or the default), limited to what fits. NaN if the shape has no such setting. */
export function shapeParam(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	if (!def) return Number.NaN;
	if (def.choices) return def.choices.some((c) => c.value === typedShare(node, def)) ? typedShare(node, def) : def.default;
	const used = Math.max(def.min, Math.min(def.max, typedShare(node, def)));
	return def.count ? Math.round(used) : used;
}

/** A setting in mm for the shape as it is now: what the Properties field shows, limited to what fits. */
export function shapeParamMm(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	return def ? shapeParam(node, key) * def.mmPerUnit(sizeOf(node)) : Number.NaN;
}

/** What was typed for a setting in mm for the shape as it is now, before it is limited to what fits (to tell when it has been). */
export function typedParamMm(node: ShapeNode, key: string): number {
	const def = paramDef(node.shapeType, key);
	return def ? typedShare(node, def) * def.mmPerUnit(sizeOf(node)) : Number.NaN;
}

/** What to keep for a setting typed as `mm` (a pick from its list, a whole count, or a share of the shape), or null if that is not allowed. */
function settingFor(node: ShapeNode, def: ParamDef, mm: number): number | null {
	if (def.choices) return def.choices.some((c) => c.value === mm) ? mm : null;
	const share = def.count ? Math.round(mm) : mm / def.mmPerUnit(sizeOf(node));
	return share > 0 ? share : null;
}

/**
 * Sets one of a shape's settings from a value in mm (for the shape as it is now), keeping it as a share of the shape. Refused (the same
 * design back) for a locked shape, a setting the shape does not have, or a number that is not above 0 and within the largest shape size.
 * Not limited to what fits here: see shapeParam.
 */
export function setShapeParam(design: Design, id: NodeId, key: string, mm: number, now?: Date): Design {
	const node = design.nodes[id];
	const def = node?.kind === 'shape' ? paramDef(node.shapeType, key) : null;
	if (node?.kind !== 'shape' || node.locked || !def) return design;
	if (!Number.isFinite(mm) || mm <= 0 || mm > MAX_SHAPE_SIZE) return design;
	const share = settingFor(node, def, mm);
	if (share === null || (def.choices ? shapeParam(node, key) : node.params[key]) === share) return design;
	const params = { ...node.params, [key]: share };
	// a thread's width and depth follow its size and fit
	if (isThreadedType(node.shapeType)) params.width = params.depth = threadFootprint(node.shapeType, params);
	const next: ShapeNode = { ...node, params };
	return { ...design, nodes: { ...design.nodes, [id]: next }, updatedAt: (now ?? new Date()).toISOString() };
}

function ellipse(a: number, b: number, z: number, positions: number[]): void {
	for (let i = 0; i < SEGMENTS; i++) {
		const t = (2 * Math.PI * i) / SEGMENTS;
		positions.push(a * Math.cos(t), b * Math.sin(t), z);
	}
}

/** A tube: an elliptical solid with a hole right through it, the outline shrunk by the wall's share of the radius (so a scaled copy of the outside). */
function tube(width: number, depth: number, height: number, wall: number): MeshData {
	const [a, b] = [width / 2, depth / 2];
	const [ia, ib] = [a * (1 - wall), b * (1 - wall)];
	const positions: number[] = [];
	// four rings: outer bottom, outer top, inner bottom, inner top
	for (const [ra, rb, z] of [
		[a, b, 0],
		[a, b, height],
		[ia, ib, 0],
		[ia, ib, height],
	] as const)
		ellipse(ra, rb, z, positions);
	const [ob, ot, ib0, it] = [0, SEGMENTS, 2 * SEGMENTS, 3 * SEGMENTS];
	const indices: number[] = [];
	for (let i = 0; i < SEGMENTS; i++) {
		const j = (i + 1) % SEGMENTS;
		indices.push(ob + i, ob + j, ot + i, ob + j, ot + j, ot + i); // the outside
		indices.push(ib0 + i, it + i, ib0 + j, ib0 + j, it + i, it + j); // the hole's wall, facing in
		indices.push(ot + i, ot + j, it + i, ot + j, it + j, it + i); // the top
		indices.push(ob + i, ib0 + i, ob + j, ob + j, ib0 + i, ib0 + j); // the bottom
	}
	return outwards(positions, indices);
}

/**
 * A torus: a ring with a round tube, stretched to the shape's width, depth and height. The tube's radius is `thickness` of the radius
 * of the whole, along x and along y (so an oval ring has an oval tube), and the shape's height vertically; it fills its box.
 */
function torus(width: number, depth: number, height: number, thickness: number): MeshData {
	const [rx, ry] = [(width / 2) * thickness, (depth / 2) * thickness];
	const [a, b] = [width / 2 - rx, depth / 2 - ry];
	const positions: number[] = [];
	for (let u = 0; u < SEGMENTS; u++) {
		const t = (2 * Math.PI * u) / SEGMENTS;
		for (let v = 0; v < RING_SEGMENTS; v++) {
			const s = (2 * Math.PI * v) / RING_SEGMENTS;
			positions.push((a + rx * Math.cos(s)) * Math.cos(t), (b + ry * Math.cos(s)) * Math.sin(t), height / 2 + (height / 2) * Math.sin(s));
		}
	}
	const at = (u: number, v: number) => (u % SEGMENTS) * RING_SEGMENTS + (v % RING_SEGMENTS);
	const indices: number[] = [];
	for (let u = 0; u < SEGMENTS; u++) {
		for (let v = 0; v < RING_SEGMENTS; v++)
			indices.push(at(u, v), at(u + 1, v), at(u, v + 1), at(u + 1, v), at(u + 1, v + 1), at(u, v + 1));
	}
	return outwards(positions, indices);
}

const STAR_POINTS = 5;

/**
 * A prism of a flat outline (corners in order, drawn for radius 1 and star-shaped about (0, 0)), stretched so its corners touch the sides,
 * back and front of the shape's box: an affine stretch of its own outline, so it resizes evenly. Each face is a fan from the outline's middle.
 */
function prism(outline: readonly (readonly [number, number])[], width: number, depth: number, height: number): MeshData {
	const [xs, ys] = [outline.map(([x]) => x), outline.map(([, y]) => y)];
	const halfWide = Math.max(...xs.map(Math.abs));
	const [lowest, highest] = [Math.min(...ys), Math.max(...ys)];
	const at = (x: number, y: number, z: number) => [
		(x / halfWide) * (width / 2),
		((y - (lowest + highest) / 2) / (highest - lowest)) * depth,
		z,
	];
	const corners = outline.length;
	const positions: number[] = [];
	for (const z of [0, height]) for (const [x, y] of outline) positions.push(...at(x, y, z));
	positions.push(...at(0, 0, 0), ...at(0, 0, height));
	const [bottom, top] = [2 * corners, 2 * corners + 1];
	const indices: number[] = [];
	for (let i = 0; i < corners; i++) {
		const j = (i + 1) % corners;
		indices.push(i, j, corners + i, j, corners + j, corners + i); // the side
		indices.push(bottom, j, i); // the bottom
		indices.push(top, corners + i, corners + j); // the top
	}
	return outwards(positions, indices);
}

/** Corners at angles 90 deg (the back) going round, so the outline is the same seen left to right. */
const corner = (k: number, of: number, radius: number): [number, number] => {
	const angle = Math.PI / 2 + (2 * Math.PI * k) / of;
	return [radius * Math.cos(angle), radius * Math.sin(angle)];
};

/** A star: five tips and five inner corners; `inner` is the inner corners' radius as a share of the tips'. */
const star = (width: number, depth: number, height: number, inner: number): MeshData =>
	prism(
		Array.from({ length: 2 * STAR_POINTS }, (_, i) => corner(i, 2 * STAR_POINTS, i % 2 === 0 ? 1 : inner)),
		width,
		depth,
		height,
	);

/** A regular polygon with a corner at the back, stretched to the box. */
const polygon = (width: number, depth: number, height: number, sides: number): MeshData =>
	prism(
		Array.from({ length: sides }, (_, k) => corner(k, sides, 1)),
		width,
		depth,
		height,
	);

/** Facets round a thread, and the steps of its helix: a row of the surface is one 48th of a pitch up, so the profile's corners fall on rows. */
const THREAD_FACETS = 48;
/** An ISO thread's depth as a share of its pitch: 5/8 of the 60-degree sharp-V height (sqrt(3)/2 of the pitch). */
const THREAD_DEPTH = (5 / 8) * (Math.sqrt(3) / 2);
/** The profile in 48ths of a pitch, from the middle of a crest: flat crest (6), flank (15), flat root (12), flank (15). */
const CREST_HALF = 3;
const FLANK = 15;

/** How far out the surface is, 0 at the root and 1 at the crest, `phase` 48ths of a pitch from the middle of a crest (any real number). */
function profile(phase: number): number {
	const wrapped = ((phase % THREAD_FACETS) + THREAD_FACETS) % THREAD_FACETS;
	const away = Math.min(wrapped, THREAD_FACETS - wrapped);
	return Math.max(0, Math.min(1, 1 - (away - CREST_HALF) / FLANK));
}

/**
 * A right-handed thread: a rod of crest radius `crest` with a groove of depth `depth` winding round it once per `pitch` (the crest
 * climbs as it goes anticlockwise), `length` long, standing on z = 0. It is built at its real size, not stretched, so the pitch is
 * exact at any length. The surface is a grid of 48 columns round and a row per 48th of a pitch up, joined along the helix, so every
 * corner of the profile is on a row and the surface is exactly the profile (the last row, at the length, is wherever it falls).
 */
function thread(length: number, crest: number, depth: number, pitch: number): MeshData {
	const step = pitch / THREAD_FACETS;
	const rows = Math.ceil(length / step - 1e-9) + 1;
	const positions: number[] = [];
	for (let j = 0; j < rows; j++) {
		const z = Math.min(j * step, length);
		for (let i = 0; i < THREAD_FACETS; i++) {
			const angle = (2 * Math.PI * i) / THREAD_FACETS;
			const r = crest - depth * (1 - profile(z / step - i));
			positions.push(r * Math.cos(angle), r * Math.sin(angle), z);
		}
	}
	positions.push(0, 0, 0, 0, 0, length);
	const [bottom, top] = [rows * THREAD_FACETS, rows * THREAD_FACETS + 1];
	const at = (i: number, j: number) => j * THREAD_FACETS + (i % THREAD_FACETS);
	const indices: number[] = [];
	for (let j = 0; j + 1 < rows; j++) {
		for (let i = 0; i < THREAD_FACETS; i++)
			indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
	}
	for (let i = 0; i < THREAD_FACETS; i++) {
		indices.push(bottom, at(i + 1, 0), at(i, 0));
		indices.push(top, at(i, rows - 1), at(i + 1, rows - 1));
	}
	return outwards(positions, indices);
}

/** A threaded shape from its size and fit: the rod, or the hole's cutter, which is the same thread opened out by the fit on every side. */
function threaded(node: ShapeNode): MeshData {
	const { size, clearance } = threadSettings(node.shapeType, node.params);
	return thread(Number(node.params.height), size.diameter / 2 + clearance, THREAD_DEPTH * size.pitch, size.pitch);
}

const BUILDERS: Record<string, (w: number, d: number, h: number, node: ShapeNode) => MeshData> = {
	tube: (w, d, h, node) => tube(w, d, h, shapeParam(node, 'wall')),
	torus: (w, d, h, node) => torus(w, d, h, shapeParam(node, 'thickness')),
	star: (w, d, h, node) => star(w, d, h, shapeParam(node, 'inner')),
	polygon: (w, d, h, node) => polygon(w, d, h, shapeParam(node, 'sides')),
	'threaded-rod': (_w, _d, _h, node) => threaded(node),
	'threaded-hole': (_w, _d, _h, node) => threaded(node),
};

/** The shape types built from their settings. */
export const PARAMETRIC_TYPES: readonly string[] = Object.keys(BUILDERS);

/** The mesh of a shape built from its settings (base centre at the origin, standing on z = 0), or null for any other shape. */
export function parametricShape(node: ShapeNode): MeshData | null {
	const build = Object.hasOwn(BUILDERS, node.shapeType) ? BUILDERS[node.shapeType] : undefined;
	return build ? build(...sizeOf(node), node) : null;
}

/** Like parametricShape, from a type, size and settings (as shares), used by tests and anywhere there is no node. */
export function parametricMesh(
	type: string,
	width: number,
	depth: number,
	height: number,
	params: Record<string, number>,
): MeshData | null {
	const node = { shapeType: type, params: { width, depth, height, ...params } } as unknown as ShapeNode;
	return parametricShape(node);
}
