import type { Vec3 } from './camera.ts';
import type { PaintFill } from './design.ts';
import type { MeshData } from './meshShape.ts';

/**
 * Where paint lands on a finished surface (the Paint tool). A fill is stored as geometry in the node's own frame, so it is looked up on
 * whatever the surface is now: a region fill finds the triangle at its point that faces the way it was clicked and spreads over the
 * connected surface, up to a sharp edge. A fill whose point no longer touches the surface paints nothing, rather than the wrong place.
 */

/** A fill's point must be this close (mm) to a triangle facing the right way. */
const REACH = 0.5;
/** ...and that triangle must face within about 45 degrees of the way the fill was made. */
const MIN_ALIGNMENT = Math.cos((45 * Math.PI) / 180);
/** A smart fill spreads from a triangle to its neighbour only if they turn no more than this many degrees (the Edge tool calls 30 sharp). */
export const DEFAULT_FILL_ANGLE = 30;
/** The largest smart fill angle: at 90 it crosses the edges of a box. */
export const MAX_FILL_ANGLE = 90;
/** Points this close (mm) are the same point. */
const WELD = 1e-5;

export interface PaintedMesh {
	/** The colours used (#rrggbb), in the order of the fills that still show. */
	colors: string[];
	/** Per triangle of the mesh: 0 for unpainted, or 1 + the index into `colors`. */
	triangle: Uint16Array;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

interface Surface {
	corners: Vec3[][];
	normals: (Vec3 | null)[];
	/** Triangles sharing an edge with each triangle. */
	neighbours: number[][];
}

/** The corners of each triangle, and the same corners as ids shared by every point that coincides (within WELD). */
function weldedCorners(mesh: MeshData): { corners: Vec3[][]; ids: number[][] } {
	const known = new Map<string, number>();
	const idOf = (i: number) => {
		const key = [0, 1, 2].map((a) => Math.round(mesh.positions[i * 3 + a]! / WELD)).join(',');
		const id = known.get(key) ?? known.size;
		known.set(key, id);
		return id;
	};
	const corners: Vec3[][] = [];
	const ids: number[][] = [];
	for (let t = 0; t < Math.floor(mesh.indices.length / 3); t++) {
		const idx = [0, 1, 2].map((k) => mesh.indices[t * 3 + k]!);
		corners.push(idx.map((i) => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!] as Vec3));
		ids.push(idx.map(idOf));
	}
	return { corners, ids };
}

/** The unit normal of a triangle, or null if it has no area or two corners coincide. */
function unitNormal(points: Vec3[], welded: number[]): Vec3 | null {
	if (new Set(welded).size < 3) return null;
	const n = cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!));
	const length = len(n);
	return length > 1e-12 ? scale(n, 1 / length) : null;
}

/** For each triangle, the others that share an edge with it (a degenerate triangle has none and is nobody's neighbour). */
function neighboursOf(ids: number[][], normals: (Vec3 | null)[]): number[][] {
	const owners = new Map<string, number[]>();
	ids.forEach((welded, t) => {
		if (!normals[t]) return;
		for (let k = 0; k < 3; k++) {
			const [a, b] = [welded[k]!, welded[(k + 1) % 3]!];
			const key = a < b ? `${a}|${b}` : `${b}|${a}`;
			owners.set(key, [...(owners.get(key) ?? []), t]);
		}
	});
	const neighbours: number[][] = ids.map(() => []);
	for (const tris of owners.values()) for (const a of tris) for (const b of tris) if (a !== b) neighbours[a]!.push(b);
	return neighbours;
}

function surfaceOf(mesh: MeshData): Surface {
	const { corners, ids } = weldedCorners(mesh);
	const normals = corners.map((points, t) => unitNormal(points, ids[t]!));
	return { corners, normals, neighbours: neighboursOf(ids, normals) };
}

/** The point of the triangle nearest `p`. */
function closestOnTriangle(p: Vec3, [a, b, c]: Vec3[]): Vec3 {
	const ab = sub(b!, a!);
	const ac = sub(c!, a!);
	const ap = sub(p, a!);
	const d1 = dot(ab, ap);
	const d2 = dot(ac, ap);
	if (d1 <= 0 && d2 <= 0) return a!;
	const bp = sub(p, b!);
	const d3 = dot(ab, bp);
	const d4 = dot(ac, bp);
	if (d3 >= 0 && d4 <= d3) return b!;
	const vc = d1 * d4 - d3 * d2;
	if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a!, scale(ab, d1 / (d1 - d3)));
	const cp = sub(p, c!);
	const d5 = dot(ab, cp);
	const d6 = dot(ac, cp);
	if (d6 >= 0 && d5 <= d6) return c!;
	const vb = d5 * d2 - d1 * d6;
	if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a!, scale(ac, d2 / (d2 - d6)));
	const va = d3 * d6 - d5 * d4;
	if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b!, scale(sub(c!, b!), (d4 - d3) / (d4 - d3 + (d5 - d6))));
	const denom = 1 / (va + vb + vc);
	return add(a!, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

/** The triangle a region fill starts from: the nearest one within reach that faces the way the fill does, or -1. */
function seedOf(surface: Surface, fill: Extract<PaintFill, { kind: 'region' }>): number {
	let best = -1;
	let bestDistance = REACH;
	for (let t = 0; t < surface.corners.length; t++) {
		const n = surface.normals[t];
		if (!n || dot(n, fill.normal) < MIN_ALIGNMENT) continue;
		const distance = len(sub(fill.point, closestOnTriangle(fill.point, surface.corners[t]!)));
		if (distance <= bestDistance) [best, bestDistance] = [t, distance];
	}
	return best;
}

/** The triangles joined to `seed` by neighbours that `joins` accepts (given the triangle it is reached from and the neighbour). */
function spreadFrom(surface: Surface, seed: number, joins: (from: number, next: number) => boolean): number[] {
	const seen = new Set([seed]);
	const queue = [seed];
	for (let head = 0; head < queue.length; head++) {
		const t = queue[head]!;
		for (const next of surface.neighbours[t]!) {
			if (seen.has(next) || !joins(t, next)) continue;
			seen.add(next);
			queue.push(next);
		}
	}
	return queue;
}

/** The triangles a fill covers on the surface, given the colour each triangle has now (a bucket fill spreads over the same colour). */
function trianglesFor(surface: Surface, fill: PaintFill, colourOf: (t: number) => string | null): number[] {
	if (fill.kind === 'body') return surface.normals.flatMap((n, t) => (n ? [t] : []));
	const seed = seedOf(surface, fill);
	if (seed < 0) return [];
	const reach = Math.cos(((fill.angle ?? DEFAULT_FILL_ANGLE) * Math.PI) / 180) - 1e-9;
	const here = colourOf(seed);
	const joins =
		fill.spread === 'bucket'
			? (_from: number, next: number) => colourOf(next) === here
			: (from: number, next: number) => dot(surface.normals[from]!, surface.normals[next]!) >= reach;
	return spreadFrom(surface, seed, joins);
}

/** Which triangles of `mesh` each fill paints, applied in order. Null if nothing ends up painted. */
export function paintTriangles(mesh: MeshData, fills: readonly PaintFill[]): PaintedMesh | null {
	if (fills.length === 0) return null;
	const surface = surfaceOf(mesh);
	const owner = new Int32Array(surface.corners.length).fill(-1); // the fill that shows on each triangle
	const colourOf = (t: number) => (owner[t]! >= 0 ? fills[owner[t]!]!.color : null);
	fills.forEach((fill, f) => {
		for (const t of trianglesFor(surface, fill, colourOf)) owner[t] = fill.color === null ? -1 : f;
	});
	const showing = [...new Set(owner)].filter((f) => f >= 0).sort((a, b) => a - b);
	if (showing.length === 0) return null;
	const colors = [...new Set(showing.map((f) => fills[f]!.color!))];
	const triangle = new Uint16Array(owner.length);
	for (let t = 0; t < owner.length; t++) if (owner[t]! >= 0) triangle[t] = colors.indexOf(fills[owner[t]!]!.color!) + 1;
	return { colors, triangle };
}
