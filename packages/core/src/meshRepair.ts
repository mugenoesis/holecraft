import type { MeshData } from './meshShape.ts';
import { faceShellsOutwards } from './shells.ts';

/*
 * Checking an imported model for the faults that stop it being cut or used in a group (which need a closed surface), and mending the usual ones:
 * triangles with no area, triangles facing the wrong way, and holes. All pure, on the model as stored (corners already joined where they meet).
 * A hole is filled flat (ear clipping on the hole's outline); what cannot be mended simply, an edge three or more triangles share, or a hole that
 * touches itself, is left and said so, never guessed at.
 */

export interface MeshHealth {
	triangles: number;
	/** Edges only one triangle has: the rim of a hole. */
	openEdges: number;
	/** Edges three or more triangles share. */
	nonManifoldEdges: number;
	/** Edges whose two triangles disagree about which way they face (one of them is turned round). */
	flippedEdges: number;
	/** Triangles with no area (a repeated corner, or all three on a line). */
	degenerate: number;
	/** Triangles of a piece that faces inwards (the surface is closed but inside out). */
	insideOut: number;
	/** A closed surface facing the right way: none of the above. */
	closed: boolean;
}

export interface MeshRepairResult {
	mesh: MeshData;
	health: MeshHealth;
	fixed: {
		/** Triangles turned round. */
		flippedFaces: number;
		degenerateRemoved: number;
		holesFilled: number;
		/** Holes that could not be filled (too big, or touching themselves). */
		holesLeft: number;
	};
}

/** Holes with more corners than this are left alone (an ear clip is O(n²)). */
const MAX_HOLE_CORNERS = 2000;

const hasNoArea = (p: Float32Array, a: number, b: number, c: number): boolean => {
	if (a === b || b === c || a === c) return true;
	const ux = p[b * 3]! - p[a * 3]!;
	const uy = p[b * 3 + 1]! - p[a * 3 + 1]!;
	const uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
	const vx = p[c * 3]! - p[a * 3]!;
	const vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
	const vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
	const cx = uy * vz - uz * vy;
	const cy = uz * vx - ux * vz;
	const cz = ux * vy - uy * vx;
	const longest = Math.max(ux * ux + uy * uy + uz * uz, vx * vx + vy * vy + vz * vz);
	return cx * cx + cy * cy + cz * cz <= 1e-18 * longest * longest;
};

interface EdgeUse {
	total: number;
	/** Uses from the lower corner to the higher one. */
	up: number;
}

/** How each edge (a pair of corners) is used by the triangles. */
function edgeUses(indices: Uint32Array, vertices: number): Map<number, EdgeUse> {
	const uses = new Map<number, EdgeUse>();
	for (let t = 0; t + 2 < indices.length; t += 3) {
		for (let k = 0; k < 3; k++) {
			const a = indices[t + k]!;
			const b = indices[t + ((k + 1) % 3)]!;
			const key = Math.min(a, b) * vertices + Math.max(a, b);
			const use = uses.get(key) ?? { total: 0, up: 0 };
			use.total++;
			if (a < b) use.up++;
			uses.set(key, use);
		}
	}
	return uses;
}

/** How many triangles belong to a piece that faces the wrong way (found by turning each piece the right way and seeing what changed). */
function turnedByShell(mesh: MeshData): number {
	const right = faceShellsOutwards(mesh);
	let turned = 0;
	for (let t = 0; t + 2 < right.length; t += 3) if (right[t + 1] !== mesh.indices[t + 1]) turned++;
	return turned;
}

export function meshHealth(mesh: MeshData): MeshHealth {
	const vertices = mesh.positions.length / 3;
	const triangles = Math.floor(mesh.indices.length / 3);
	let degenerate = 0;
	for (let t = 0; t < triangles; t++) {
		if (hasNoArea(mesh.positions, mesh.indices[t * 3]!, mesh.indices[t * 3 + 1]!, mesh.indices[t * 3 + 2]!)) degenerate++;
	}
	let openEdges = 0;
	let nonManifoldEdges = 0;
	let flippedEdges = 0;
	for (const use of edgeUses(mesh.indices, vertices).values()) {
		if (use.total === 1) openEdges++;
		else if (use.total > 2) nonManifoldEdges++;
		else if (use.up !== 1) flippedEdges++;
	}
	const insideOut = openEdges === 0 && nonManifoldEdges === 0 && flippedEdges === 0 ? turnedByShell(mesh) : 0;
	const closed = triangles > 0 && openEdges === 0 && nonManifoldEdges === 0 && flippedEdges === 0 && degenerate === 0 && insideOut === 0;
	return { triangles, openEdges, nonManifoldEdges, flippedEdges, degenerate, insideOut, closed };
}

/** The three sides of triangle `t`, each as the pair of corners it runs from and to. */
const sidesOf = (indices: Uint32Array, t: number): [number, number][] =>
	[0, 1, 2].map((k) => [indices[t * 3 + k]!, indices[t * 3 + ((k + 1) % 3)]!] as [number, number]);

const edgeKey = (a: number, b: number, vertices: number): number => Math.min(a, b) * vertices + Math.max(a, b);

/** For each edge, the triangles that have it. */
function trianglesByEdge(indices: Uint32Array, vertices: number): Map<number, number[]> {
	const byEdge = new Map<number, number[]>();
	for (let t = 0; t < indices.length / 3; t++) {
		for (const [a, b] of sidesOf(indices, t)) {
			const key = edgeKey(a, b, vertices);
			const list = byEdge.get(key);
			if (list) list.push(t);
			else byEdge.set(key, [t]);
		}
	}
	return byEdge;
}

const runsAlong = (indices: Uint32Array, t: number, a: number, b: number): boolean =>
	sidesOf(indices, t).some(([x, y]) => x === a && y === b);

function turnRound(indices: Uint32Array, t: number): void {
	const second = indices[t * 3 + 1]!;
	indices[t * 3 + 1] = indices[t * 3 + 2]!;
	indices[t * 3 + 2] = second;
}

/** The triangle on the other side of the side a-b from triangle `t`, when exactly two triangles have that side. */
function across(byEdge: Map<number, number[]>, vertices: number, t: number, a: number, b: number): number | null {
	const sharing = byEdge.get(edgeKey(a, b, vertices));
	if (sharing?.length !== 2) return null;
	return sharing[0] === t ? sharing[1]! : sharing[0]!;
}

/** Turns the triangles of the piece `start` is in so they all agree with it; how many were turned. */
function orientPiece(indices: Uint32Array, vertices: number, byEdge: Map<number, number[]>, seen: Uint8Array, start: number): number {
	seen[start] = 1;
	const queue = [start];
	let turned = 0;
	for (let head = 0; head < queue.length; head++) {
		const t = queue[head]!;
		for (const [a, b] of sidesOf(indices, t)) {
			const u = across(byEdge, vertices, t, a, b);
			if (u === null || seen[u]) continue;
			seen[u] = 1;
			if (runsAlong(indices, u, a, b)) {
				turnRound(indices, u);
				turned++;
			}
			queue.push(u);
		}
	}
	return turned;
}

/** Turns triangles round so neighbours agree about which way they face, piece by piece; how many were turned. */
function orient(indices: Uint32Array, vertices: number): number {
	const byEdge = trianglesByEdge(indices, vertices);
	const seen = new Uint8Array(indices.length / 3);
	let turned = 0;
	for (let t = 0; t < seen.length; t++) if (!seen[t]) turned += orientPiece(indices, vertices, byEdge, seen, t);
	return turned;
}

/** The sides only one triangle has, as "corner: the corners it runs to". */
function openSides(indices: Uint32Array, vertices: number): Map<number, number[]> {
	const byEdge = trianglesByEdge(indices, vertices);
	const from = new Map<number, number[]>();
	for (let t = 0; t < indices.length / 3; t++) {
		for (const [a, b] of sidesOf(indices, t)) {
			if (byEdge.get(edgeKey(a, b, vertices))?.length !== 1) continue;
			const list = from.get(a);
			if (list) list.push(b);
			else from.set(a, [b]);
		}
	}
	return from;
}

/** Follows open sides from `start` round towards where they began: the corners passed, and whether they came back to the start as a usable ring. */
function walkRim(from: Map<number, number[]>, start: number): { path: number[]; ring: boolean } {
	const path = [start];
	let at = from.get(start)![0]!;
	while (at !== start) {
		const next = from.get(at);
		if (next?.length !== 1 || path.includes(at) || path.length > MAX_HOLE_CORNERS) return { path: [...path, at], ring: false };
		path.push(at);
		at = next[0]!;
	}
	return { path, ring: path.length >= 3 };
}

/** The rims of the holes: each a ring of corners in the direction the triangles beside the hole run along it. Rims that cannot be followed are counted. */
function holeRims(indices: Uint32Array, vertices: number): { rims: number[][]; unusable: number } {
	const from = openSides(indices, vertices);
	const rims: number[][] = [];
	const used = new Set<number>();
	let unusable = 0;
	for (const [start, ends] of from) {
		if (used.has(start)) continue;
		const walked = ends.length === 1 ? walkRim(from, start) : { path: [start], ring: false };
		for (const v of walked.path) used.add(v);
		if (walked.ring) rims.push(walked.path);
		else unusable++;
	}
	return { rims, unusable };
}

type Vec = [number, number, number];

const corner = (p: Float32Array, v: number): Vec => [p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!];

/** The direction a ring of corners faces (Newell's method): its length is twice the area it encloses. */
function ringNormal(p: Float32Array, ring: number[]): Vec {
	const n: Vec = [0, 0, 0];
	for (let i = 0; i < ring.length; i++) {
		const a = corner(p, ring[i]!);
		const b = corner(p, ring[(i + 1) % ring.length]!);
		n[0] += (a[1] - b[1]) * (a[2] + b[2]);
		n[1] += (a[2] - b[2]) * (a[0] + b[0]);
		n[2] += (a[0] - b[0]) * (a[1] + b[1]);
	}
	return n;
}

type Flat = (vertex: number) => [number, number];

/** The corners flattened onto the plane the ring lies nearest to, turned so the ring runs counter-clockwise. */
function flattener(p: Float32Array, ring: number[]): Flat {
	const n = ringNormal(p, ring);
	const axis = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
	const sign = n[axis] < 0 ? -1 : 1;
	const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
	return (vertex) => [corner(p, vertex)[u]!, sign * corner(p, vertex)[v]!];
}

const turnOf = (a: [number, number], b: [number, number], c: [number, number]) =>
	(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Whether the corner at `i` of the remaining ring is an ear: it turns the right way and no other corner is inside the triangle it makes. */
function isEar(flat: Flat, remaining: number[], i: number): boolean {
	const a = remaining[(i + remaining.length - 1) % remaining.length]!;
	const b = remaining[i]!;
	const c = remaining[(i + 1) % remaining.length]!;
	const [fa, fb, fc] = [flat(a), flat(b), flat(c)];
	if (turnOf(fa, fb, fc) <= 0) return false;
	return !remaining.some((w) => {
		if (w === a || w === b || w === c) return false;
		const f = flat(w);
		return turnOf(fa, fb, f) >= 0 && turnOf(fb, fc, f) >= 0 && turnOf(fc, fa, f) >= 0;
	});
}

/** The triangles that fill a ring of corners, in the ring's own direction (ear clipping); null if it will not clip. */
function earClip(p: Float32Array, ring: number[]): number[] | null {
	const flat = flattener(p, ring);
	const remaining = [...ring];
	const out: number[] = [];
	while (remaining.length > 3) {
		const i = remaining.findIndex((_, at) => isEar(flat, remaining, at));
		if (i < 0) return null;
		out.push(remaining[(i + remaining.length - 1) % remaining.length]!, remaining[i]!, remaining[(i + 1) % remaining.length]!);
		remaining.splice(i, 1);
	}
	out.push(remaining[0]!, remaining[1]!, remaining[2]!);
	return out;
}

/** Mends what can be mended simply (see the top of this file). The mesh given is not changed; a closed one comes back as it is. */
export function repairMesh(mesh: MeshData): MeshRepairResult {
	const before = meshHealth(mesh);
	if (before.closed) return { mesh, health: before, fixed: { flippedFaces: 0, degenerateRemoved: 0, holesFilled: 0, holesLeft: 0 } };

	const positions = mesh.positions;
	const kept: number[] = [];
	for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
		const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
		if (!hasNoArea(positions, a, b, c)) kept.push(a, b, c);
	}
	const degenerateRemoved = (mesh.indices.length - kept.length) / 3;
	let indices: Uint32Array = Uint32Array.from(kept);

	const flippedFaces = orient(indices, positions.length / 3);

	const { rims, unusable } = holeRims(indices, positions.length / 3);
	const added: number[] = [];
	let holesFilled = 0;
	let holesLeft = unusable;
	for (const rim of rims) {
		const filled = earClip(positions, [...rim].reverse());
		if (filled) {
			added.push(...filled);
			holesFilled++;
		} else holesLeft++;
	}
	if (added.length > 0) indices = Uint32Array.from([...indices, ...added]);

	indices = faceShellsOutwards({ positions, indices });
	const repaired: MeshData = { positions, indices };
	return { mesh: repaired, health: meshHealth(repaired), fixed: { flippedFaces, degenerateRemoved, holesFilled, holesLeft } };
}
