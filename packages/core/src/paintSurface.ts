import type { Vec3 } from './camera.ts';
import type { MeshData } from './meshShape.ts';
import { cross, len, scale, sub } from './vec3.ts';

/** A mesh as paint sees it: triangles with their corners welded, their unit normals, and which triangles touch along an edge. */

/** Points this close (mm) are the same point. */
const WELD = 1e-5;

export interface Surface {
	corners: Vec3[][];
	normals: (Vec3 | null)[];
	/** Triangles sharing an edge with each triangle. */
	neighbours: number[][];
	/** The same corners as ids, shared by every corner that coincides. */
	ids: number[][];
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

export function surfaceOf(mesh: MeshData): Surface {
	const { corners, ids } = weldedCorners(mesh);
	const normals = corners.map((points, t) => unitNormal(points, ids[t]!));
	return { corners, normals, neighbours: neighboursOf(ids, normals), ids };
}

/** The area of triangle `t` (mm2). */
export function triangleArea(surface: Surface, t: number): number {
	const [a, b, c] = surface.corners[t]!;
	return len(cross(sub(b!, a!), sub(c!, a!))) / 2;
}

/** The length of the edge triangles `a` and `b` share (0 if they do not share one). */
export function sharedEdgeLength(surface: Surface, a: number, b: number): number {
	const ids = surface.ids[b]!;
	const shared = surface.ids[a]!.flatMap((id, k) => (ids.includes(id) ? [k] : []));
	if (shared.length !== 2) return 0;
	return len(sub(surface.corners[a]![shared[0]!]!, surface.corners[a]![shared[1]!]!));
}
