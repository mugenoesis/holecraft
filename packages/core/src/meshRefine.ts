import type { Vec3 } from './camera.ts';
import type { MeshData } from './meshShape.ts';
import { closestOnTriangle, len, sub } from './vec3.ts';

/**
 * Cutting a surface finer where a brush touches it, so the paint follows the brush's edge instead of whole big triangles (as OrcaSlicer's
 * painting splits triangles under the brush). Triangles are split along shared edge midpoints, so neighbours split the same way and the
 * surface stays closed with no cracks: a triangle with one split edge becomes two, two becomes three, three becomes four.
 */

/** A convex piece of space a brush paints, and how fine to cut the surface inside it. */
export interface BrushRegion {
	centre: Vec3;
	/** A ball round the centre that holds the whole region. */
	reach: number;
	/** Triangle edges longer than this are cut where the region's edge crosses them. */
	target: number;
	inside: (p: Vec3) => boolean;
}

/** Cutting stops here, however fine the brushes ask for. */
const MAX_ROUNDS = 12;
const MAX_TRIANGLES = 300_000;
/** Points this close (mm) are the same point. */
const WELD = 1e-5;

type Tri = [number, number, number];

function weld(mesh: MeshData): { points: Vec3[]; tris: Tri[] } {
	const ids = new Map<string, number>();
	const points: Vec3[] = [];
	const idOf = (i: number) => {
		const p: Vec3 = [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
		const key = p.map((v) => Math.round(v / WELD)).join(',');
		let id = ids.get(key);
		if (id === undefined) {
			id = points.length;
			ids.set(key, id);
			points.push(p);
		}
		return id;
	};
	const tris: Tri[] = [];
	for (let i = 0; i + 2 < mesh.indices.length; i += 3)
		tris.push([idOf(mesh.indices[i]!), idOf(mesh.indices[i + 1]!), idOf(mesh.indices[i + 2]!)]);
	return { points, tris };
}

/** The regions bucketed by where they are, so a triangle only asks the ones near it. */
class RegionGrid {
	private readonly cells = new Map<string, BrushRegion[]>();
	private readonly cell: number;

	constructor(regions: readonly BrushRegion[]) {
		this.cell = Math.max(1, ...regions.map((r) => r.reach * 2));
		for (const r of regions) {
			const [lo, hi] = this.range(r.centre, r.reach);
			for (let x = lo[0]; x <= hi[0]; x++) {
				for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) this.add(`${x},${y},${z}`, r);
			}
		}
	}

	private range(c: Vec3, r: number): [Vec3, Vec3] {
		const at = (v: number) => Math.floor(v / this.cell);
		return [
			[at(c[0] - r), at(c[1] - r), at(c[2] - r)],
			[at(c[0] + r), at(c[1] + r), at(c[2] + r)],
		];
	}

	private add(key: string, r: BrushRegion): void {
		const list = this.cells.get(key);
		if (list) list.push(r);
		else this.cells.set(key, [r]);
	}

	/** Regions that may touch a triangle with these corners (each at most once). */
	near(corners: Vec3[]): Set<BrushRegion> {
		const found = new Set<BrushRegion>();
		const lo = [0, 1, 2].map((a) => Math.min(...corners.map((p) => p[a]!))) as Vec3;
		const hi = [0, 1, 2].map((a) => Math.max(...corners.map((p) => p[a]!))) as Vec3;
		const [from] = this.range(lo, 0);
		const [, to] = this.range(hi, 0);
		for (let x = from[0]; x <= to[0]; x++) {
			for (let y = from[1]; y <= to[1]; y++) {
				for (let z = from[2]; z <= to[2]; z++) for (const r of this.cells.get(`${x},${y},${z}`) ?? []) found.add(r);
			}
		}
		return found;
	}
}

const longestEdge = (c: Vec3[]) => Math.max(len(sub(c[0]!, c[1]!)), len(sub(c[1]!, c[2]!)), len(sub(c[2]!, c[0]!)));

/** Whether the region's edge crosses the triangle and it is still coarser than the region asks for. */
function needsCut(corners: Vec3[], grid: RegionGrid): boolean {
	const longest = longestEdge(corners);
	for (const region of grid.near(corners)) {
		if (longest <= region.target) continue;
		if (len(sub(region.centre, closestOnTriangle(region.centre, corners))) > region.reach) continue;
		if (corners.every((p) => region.inside(p))) continue;
		return true;
	}
	return false;
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** `tri` cut at the midpoints in `mid` (a vertex id for each edge that is cut, by the edge's end ids), the triangles keeping their winding. */
function cutTriangle(tri: Tri, mid: (a: number, b: number) => number | undefined): Tri[] {
	const [v0, v1, v2] = tri;
	const m = [mid(v0, v1), mid(v1, v2), mid(v2, v0)];
	const cut = m.filter((v) => v !== undefined).length;
	if (cut === 0) return [tri];
	if (cut === 3)
		return [
			[v0, m[0]!, m[2]!],
			[m[0]!, v1, m[1]!],
			[m[2]!, m[1]!, v2],
			[m[0]!, m[1]!, m[2]!],
		];
	// turn the triangle so the cut edges come first
	const turns = cut === 1 ? m.findIndex((v) => v !== undefined) : m.findIndex((v, i) => v !== undefined && m[(i + 2) % 3] === undefined);
	const v = [v0, v1, v2];
	const [a, b, c] = [v[turns]!, v[(turns + 1) % 3]!, v[(turns + 2) % 3]!];
	const [mab, mbc] = [m[turns]!, m[(turns + 1) % 3]];
	if (cut === 1)
		return [
			[a, mab, c],
			[mab, b, c],
		];
	return [
		[mab, b, mbc!],
		[a, mab, mbc!],
		[a, mbc!, c],
	];
}

/** One round: every triangle that needs it gets all three edges cut, and neighbours are cut to match. Null when nothing needed cutting. */
function roundOfCuts(points: Vec3[], tris: Tri[], grid: RegionGrid): Tri[] | null {
	const marked = new Set<string>();
	for (const t of tris) {
		if (
			!needsCut(
				t.map((i) => points[i]!),
				grid,
			)
		)
			continue;
		for (let k = 0; k < 3; k++) marked.add(edgeKey(t[k]!, t[(k + 1) % 3]!));
	}
	if (marked.size === 0 || tris.length + marked.size * 2 > MAX_TRIANGLES) return null;
	const mids = new Map<string, number>();
	for (const key of marked) {
		const [a, b] = key.split('|').map(Number) as [number, number];
		mids.set(key, points.length);
		points.push([0, 1, 2].map((k) => (points[a]![k]! + points[b]![k]!) / 2) as Vec3);
	}
	return tris.flatMap((t) => cutTriangle(t, (a, b) => mids.get(edgeKey(a, b))));
}

/** A flat cut through space: the points where `normal` . p = `offset`. */
export interface CutPlane {
	normal: Vec3;
	offset: number;
}

/** A corner this close (mm) to a plane is on it, so an edge only ends there rather than being cut. */
const ON_PLANE = 1e-6;

/** One plane's cut: each edge with corners strictly on opposite sides gets a new corner where it crosses, shared by the triangles on both sides. */
function cutAlong(points: Vec3[], tris: Tri[], plane: CutPlane): Tri[] {
	const distance = points.map((p) => plane.normal[0] * p[0] + plane.normal[1] * p[1] + plane.normal[2] * p[2] - plane.offset);
	const side = (i: number) => (distance[i]! > ON_PLANE ? 1 : distance[i]! < -ON_PLANE ? -1 : 0);
	const crossings = new Map<string, number>();
	for (const t of tris) {
		for (let k = 0; k < 3; k++) {
			const [a, b] = [t[k]!, t[(k + 1) % 3]!];
			const key = edgeKey(a, b);
			if (side(a) * side(b) >= 0 || crossings.has(key)) continue;
			const along = distance[a]! / (distance[a]! - distance[b]!);
			crossings.set(key, points.length);
			points.push([0, 1, 2].map((q) => points[a]![q]! + (points[b]![q]! - points[a]![q]!) * along) as Vec3);
		}
	}
	return crossings.size === 0 ? tris : tris.flatMap((t) => cutTriangle(t, (a, b) => crossings.get(edgeKey(a, b))));
}

const flatten = (points: Vec3[], tris: Tri[]): MeshData => {
	const positions = new Float32Array(points.length * 3);
	for (const [i, p] of points.entries()) positions.set(p, i * 3);
	return { positions, indices: Uint32Array.from(tris.flat()) };
};

/** `mesh` cut straight along each plane where it crosses, so no triangle has both sides of a plane. The surface stays closed. */
export function cutByPlanes(mesh: MeshData, planes: readonly CutPlane[]): MeshData {
	const { points, tris: first } = weld(mesh);
	let tris = first;
	for (const plane of planes) tris = cutAlong(points, tris, plane);
	return flatten(points, tris);
}

/** `mesh` cut finer where the regions' edges cross it. The same closed surface, with the same area and volume. */
export function refineMesh(mesh: MeshData, regions: readonly BrushRegion[]): MeshData {
	let { points, tris } = weld(mesh);
	const grid = new RegionGrid(regions);
	for (let round = 0; round < MAX_ROUNDS; round++) {
		const next = roundOfCuts(points, tris, grid);
		if (!next) break;
		tris = next;
	}
	return flatten(points, tris);
}
