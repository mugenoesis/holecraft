import type { Vec3 } from './camera.ts';
import type { BrushDab, PaintFill } from './design.ts';
import { type BrushRegion, type CutPlane, cutByPlanes, refineMesh } from './meshRefine.ts';
import type { MeshData } from './meshShape.ts';
import { mergeGaps } from './paintGaps.ts';
import { type Surface, surfaceOf } from './paintSurface.ts';
import { closestOnTriangle, dot, len, scale, sub } from './vec3.ts';

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
export interface PaintedMesh {
	/** The colours used (#rrggbb), in the order of the fills that still show. */
	colors: string[];
	/** Per triangle of the mesh: 0 for unpainted, or 1 + the index into `colors`. */
	triangle: Uint16Array;
	/** The mesh the triangles belong to when it had to be cut finer for a brush; absent when it is the one given. */
	mesh?: MeshData;
}

/** The triangle a region fill starts from: the nearest one within reach that faces the way the fill does, or -1. */
function seedOf(surface: Surface, fill: { point: Vec3; normal: Vec3 }): number {
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

/** How fine the brush cuts the surface: edges longer than this share of its radius are cut where its edge crosses them. */
const CUT_FRACTION = 0.2;
/** A circle brush reaches this far (in radii) either side of the surface it was put on, and only paints faces turned this much towards it. */
const CIRCLE_DEPTH = 0.75;
const CIRCLE_FACING = Math.cos((60 * Math.PI) / 180);

/** The piece of space one dab paints (a ball for a sphere, a short cylinder along the dab's normal for a circle). */
function regionOf(shape: 'circle' | 'sphere', radius: number, dab: BrushDab): BrushRegion {
	const target = Math.max(radius * CUT_FRACTION, 0.05);
	if (shape === 'sphere') return { centre: dab.point, reach: radius, target, inside: (p) => len(sub(p, dab.point)) <= radius };
	return {
		centre: dab.point,
		reach: radius * Math.hypot(1, CIRCLE_DEPTH),
		target,
		inside: (p) => {
			const d = sub(p, dab.point);
			const axial = dot(d, dab.normal);
			return Math.abs(axial) <= radius * CIRCLE_DEPTH && len(sub(d, scale(dab.normal, axial))) <= radius;
		},
	};
}

type Band = Extract<PaintFill, { kind: 'band' }>;
/** A band's two planes: where it starts and where it ends along its direction. */
const planesOf = (band: Band): CutPlane[] => {
	const start = dot(band.up, band.origin);
	return [
		{ normal: band.up, offset: start },
		{ normal: band.up, offset: start + band.height },
	];
};

/** The triangles inside a band: after the cut each is wholly inside or outside, so its middle says which (a face on an edge counts). */
function bandTriangles(surface: Surface, band: Band): number[] {
	const start = dot(band.up, band.origin);
	return surface.corners.flatMap((points, t) => {
		if (!surface.normals[t]) return [];
		const along = points.reduce((sum, p) => sum + dot(band.up, p), 0) / 3 - start;
		return along >= -ON_EDGE && along <= band.height + ON_EDGE ? [t] : [];
	});
}
/** A face this close (mm) to a band's edge is on it. */
const ON_EDGE = 1e-5;

type Brush = Extract<PaintFill, { kind: 'brush' }>;
const regionsOf = (brush: Brush): BrushRegion[] =>
	brush.shape === 'triangle' ? [] : brush.dabs.map((dab) => regionOf(brush.shape as 'circle' | 'sphere', brush.radius, dab));

/** Triangle centres bucketed by where they are, so a dab only looks at the triangles near it. */
class CentreGrid {
	private readonly cells = new Map<string, number[]>();
	constructor(
		surface: Surface,
		private readonly cell: number,
	) {
		surface.corners.forEach((points, t) => {
			if (!surface.normals[t]) return;
			const key = this.keyOf(this.centre(points));
			const list = this.cells.get(key);
			if (list) list.push(t);
			else this.cells.set(key, [t]);
		});
	}
	centre(points: Vec3[]): Vec3 {
		return [0, 1, 2].map((a) => (points[0]![a]! + points[1]![a]! + points[2]![a]!) / 3) as Vec3;
	}
	private keyOf(p: Vec3): string {
		return p.map((v) => Math.floor(v / this.cell)).join(',');
	}
	/** Triangles whose centre may be within `r` of `p`. */
	near(p: Vec3, r: number): number[] {
		const at = (v: number) => Math.floor(v / this.cell);
		const out: number[] = [];
		for (let x = at(p[0] - r); x <= at(p[0] + r); x++) {
			for (let y = at(p[1] - r); y <= at(p[1] + r); y++) {
				for (let z = at(p[2] - r); z <= at(p[2] + r); z++) out.push(...(this.cells.get(`${x},${y},${z}`) ?? []));
			}
		}
		return out;
	}
}

/** The triangles a brush stroke covers: those whose middle is inside a dab's region (a circle also needs the face to turn towards the dab). */
function brushTriangles(surface: Surface, brush: Brush, grid: CentreGrid): number[] {
	if (brush.shape === 'triangle') return brush.dabs.map((dab) => seedOf(surface, dab)).filter((t) => t >= 0);
	const covered = new Set<number>();
	brush.dabs.forEach((dab, i) => {
		const region = regionsOf(brush)[i]!;
		for (const t of grid.near(dab.point, region.reach)) {
			const facing = brush.shape === 'sphere' || dot(surface.normals[t]!, dab.normal) >= CIRCLE_FACING;
			if (facing && region.inside(grid.centre(surface.corners[t]!))) covered.add(t);
		}
	});
	return [...covered].sort((x, y) => x - y);
}

/** The triangles a fill covers on the surface, given the colour each triangle has now (a bucket fill spreads over the same colour). */
function trianglesFor(surface: Surface, fill: PaintFill, colourOf: (t: number) => string | null, grid: CentreGrid): number[] {
	if (fill.kind === 'body') return surface.normals.flatMap((n, t) => (n ? [t] : []));
	if (fill.kind === 'brush') return brushTriangles(surface, fill, grid);
	if (fill.kind === 'band') return bandTriangles(surface, fill);
	if (fill.kind === 'gaps') return [];
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
	// bands are cut straight along their planes, then brushes cut the surface finer where their edges cross it, all before any paint is laid
	const planes = fills.flatMap((f) => (f.kind === 'band' ? planesOf(f) : []));
	const regions = fills.flatMap((f) => (f.kind === 'brush' ? regionsOf(f) : []));
	const straight = planes.length > 0 ? cutByPlanes(mesh, planes) : null;
	const refined = regions.length > 0 ? refineMesh(straight ?? mesh, regions) : straight;
	const surface = surfaceOf(refined ?? mesh);
	const grid = new CentreGrid(surface, Math.max(1, ...fills.map((f) => (f.kind === 'brush' ? f.radius : 0))));
	const owner = new Int32Array(surface.corners.length).fill(-1); // the fill that shows on each triangle
	const colourOf = (t: number) => (owner[t]! >= 0 ? fills[owner[t]!]!.color : null);
	fills.forEach((fill, f) => {
		if (fill.kind === 'gaps') mergeGaps(surface, owner, colourOf, fill.area);
		else for (const t of trianglesFor(surface, fill, colourOf, grid)) owner[t] = fill.color === null ? -1 : f;
	});
	const showing = [...new Set(owner)].filter((f) => f >= 0).sort((a, b) => a - b);
	if (showing.length === 0) return null;
	const colors = [...new Set(showing.map((f) => fills[f]!.color!))];
	const triangle = new Uint16Array(owner.length);
	for (let t = 0; t < owner.length; t++) if (owner[t]! >= 0) triangle[t] = colors.indexOf(fills[owner[t]!]!.color!) + 1;
	return { colors, triangle, ...(refined && { mesh: refined }) };
}
