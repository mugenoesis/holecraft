import type { Vec3 } from './camera.ts';
import type { MeshData } from './meshShape.ts';

/**
 * The sharp edges of a solid, for the Edge tool (Stage B of chamfers). An edge is where two faces meet at more than
 * SHARP_ANGLE and the solid points outwards (convex); concave edges are not offered. A straight edge the mesh happens
 * to split into pieces comes back whole, and a run of short edges that turns gently (a cylinder's rim) comes back as
 * one polyline, closed if it loops.
 */

/** An edge: a polyline (2 or more points; a closed one repeats its first point at the end), and for each of its
 * segments the outward directions of the two faces that meet there. */
export interface MeshEdge {
	points: Vec3[];
	normals: [Vec3, Vec3][];
	closed: boolean;
}

/** Faces meeting more sharply than this make an edge; a 64-sided cylinder's facets (5.6 degrees) don't. */
const SHARP_ANGLE = (30 * Math.PI) / 180;
/** Neighbouring pieces of an edge that turn less than this are one edge (a curved rim); more is a corner. */
const SMOOTH_TURN = (35 * Math.PI) / 180;
/** Points this close (mm) are the same point. */
const WELD = 1e-5;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => {
	const n = norm(a);
	return [a[0] / n, a[1] / n, a[2] / n];
};

/** Welds coinciding points, so triangles that touch share corner ids. Hashes the rounded coordinates in a flat table (no string keys: threads are 260k triangles). */
function weld(mesh: MeshData): { points: Vec3[]; tris: [number, number, number][] } {
	const count = Math.floor(mesh.positions.length / 3);
	const size = 2 ** Math.max(4, Math.ceil(Math.log2(count * 2 + 1)));
	const table = new Int32Array(size).fill(-1);
	const grid = new Float64Array(count * 3);
	const points: Vec3[] = [];
	const idOfVertex = new Int32Array(count);
	for (let i = 0; i < count; i++) {
		const q: Vec3 = [
			Math.round(mesh.positions[i * 3]! / WELD),
			Math.round(mesh.positions[i * 3 + 1]! / WELD),
			Math.round(mesh.positions[i * 3 + 2]! / WELD),
		];
		let slot = Math.abs((Math.imul(q[0] | 0, 73856093) ^ Math.imul(q[1] | 0, 19349663) ^ Math.imul(q[2] | 0, 83492791)) | 0) & (size - 1);
		for (;;) {
			const found = table[slot]!;
			if (found < 0) {
				table[slot] = points.length;
				grid.set(q, points.length * 3);
				idOfVertex[i] = points.length;
				points.push([mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!]);
				break;
			}
			if (grid[found * 3] === q[0] && grid[found * 3 + 1] === q[1] && grid[found * 3 + 2] === q[2]) {
				idOfVertex[i] = found;
				break;
			}
			slot = (slot + 1) & (size - 1);
		}
	}
	// Corners are numbered in the order the triangles first meet them (a degenerate triangle's too), which fixes where each edge starts and
	// which way it runs: the same answer, in the same order, as the string-keyed version gave.
	const renumbered = new Int32Array(points.length).fill(-1);
	const ordered: Vec3[] = [];
	const idOf = (vertex: number) => {
		const welded = idOfVertex[vertex]!;
		if (renumbered[welded]! < 0) {
			renumbered[welded] = ordered.length;
			ordered.push(points[welded]!);
		}
		return renumbered[welded]!;
	};
	const tris: [number, number, number][] = [];
	for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
		const t: [number, number, number] = [idOf(mesh.indices[i]!), idOf(mesh.indices[i + 1]!), idOf(mesh.indices[i + 2]!)];
		if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) tris.push(t);
	}
	return { points: ordered, tris };
}

interface Segment {
	a: number;
	b: number;
	normals: [Vec3, Vec3];
}

/** Thrown by `sharpEdges` when it finds more sharp pieces than the `limit` it was given. */
export class TooManyEdges extends Error {
	constructor(readonly limit: number) {
		super('This shape has too many small edges to chamfer or round (a thread, for example)');
	}
}

/** Which triangles share each side, in a flat hash table (no Map: 800k lookups on a thread). A half-edge is triangle * 3 + corner. */
class SideTable {
	private readonly size: number;
	private readonly table: Int32Array;
	private readonly second: Int32Array;
	private readonly owners: Uint8Array;
	/** Whether half-edge h was the first to reach its side (sides are listed in the order they were first met). */
	private readonly first: Uint8Array;

	constructor(private readonly tris: [number, number, number][]) {
		const halves = tris.length * 3;
		this.size = 2 ** Math.max(4, Math.ceil(Math.log2(halves * 2 + 1)));
		this.table = new Int32Array(this.size).fill(-1);
		this.second = new Int32Array(halves).fill(-1);
		this.owners = new Uint8Array(halves);
		this.first = new Uint8Array(halves);
		for (let h = 0; h < halves; h++) this.add(h);
	}

	/** The two corners of half-edge `h`. */
	ends(h: number): [number, number] {
		const t = this.tris[(h / 3) | 0]!;
		return [t[h % 3]!, t[(h + 1) % 3]!];
	}

	private add(h: number): void {
		const [p, q] = this.ends(h);
		const [a, b] = p < q ? [p, q] : [q, p];
		let slot = (((Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0) & (this.size - 1)) >>> 0;
		for (;;) {
			const found = this.table[slot]!;
			if (found < 0) {
				this.table[slot] = h;
				this.owners[h] = 1;
				this.first[h] = 1;
				return;
			}
			const [fp, fq] = this.ends(found);
			if (Math.min(fp, fq) === a && Math.max(fp, fq) === b) {
				if (this.owners[found] === 1) this.second[found] = h;
				this.owners[found] = Math.min(3, this.owners[found]! + 1);
				return;
			}
			slot = (slot + 1) & (this.size - 1);
		}
	}

	/** Every side shared by exactly two triangles: the first one's half-edge, and the other triangle. */
	*pairs(): Generator<{ half: number; other: number }> {
		for (let half = 0; half < this.first.length; half++) {
			if (this.first[half] === 1 && this.owners[half] === 2) yield { half, other: (this.second[half]! / 3) | 0 };
		}
	}
}

/** The convex sharp mesh edges: pairs of triangles sharing a side whose faces meet at more than SHARP_ANGLE. */
function sharpSegments(points: Vec3[], tris: [number, number, number][], limit: number): Segment[] {
	const normals = tris.map(([a, b, c]) => unit(cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!))));
	const sides = new SideTable(tris);
	const cosSharp = Math.cos(SHARP_ANGLE);
	const segments: Segment[] = [];
	for (const { half, other } of sides.pairs()) {
		const [n1, n2] = [normals[(half / 3) | 0]!, normals[other]!];
		if (!(dot(n1, n2) < cosSharp)) continue;
		const [p, q] = sides.ends(half);
		const [a, b] = p < q ? [p, q] : [q, p]; // lower corner first, as the side is keyed
		// convex when the second face's far corner lies below the first face
		const far = tris[other]!.find((v) => v !== a && v !== b)!;
		if (dot(sub(points[far]!, points[a]!), n1) >= -1e-9) continue;
		if (segments.length >= limit) throw new TooManyEdges(limit);
		segments.push({ a, b, normals: [n1, n2] });
	}
	return segments;
}

const sameDirection = (a: Vec3, b: Vec3) => dot(a, b) > 1 - 1e-6;
const sameFaces = (x: [Vec3, Vec3], y: [Vec3, Vec3]) =>
	(sameDirection(x[0], y[0]) && sameDirection(x[1], y[1])) || (sameDirection(x[0], y[1]) && sameDirection(x[1], y[0]));

/** Chains segments into polylines through points where exactly two meet and the line turns gently. */
class Chainer {
	private readonly at = new Map<number, number[]>();
	private readonly used = new Set<number>();

	constructor(
		private readonly points: Vec3[],
		private readonly segments: Segment[],
	) {
		segments.forEach((seg, i) => {
			for (const v of [seg.a, seg.b]) this.at.set(v, [...(this.at.get(v) ?? []), i]);
		});
	}

	edges(): MeshEdge[] {
		const edges: MeshEdge[] = [];
		for (let start = 0; start < this.segments.length; start++) {
			if (this.used.has(start)) continue;
			const { seg, v } = this.walkBack(start);
			edges.push(this.walkForward(seg, v));
		}
		return edges;
	}

	/** The far end of segment `seg` from point `v`. */
	private other(seg: number, v: number): number {
		const s = this.segments[seg]!;
		return s.a === v ? s.b : s.a;
	}

	private dir(from: number, to: number): Vec3 {
		return unit(sub(this.points[to]!, this.points[from]!));
	}

	/** The segment that carries on smoothly from `seg` through point `v`, if any. */
	private next(seg: number, v: number): number | null {
		const here = this.at.get(v)!;
		if (here.length !== 2) return null;
		const following = here[0] === seg ? here[1]! : here[0]!;
		const incoming = this.dir(this.other(seg, v), v);
		const outgoing = this.dir(v, this.other(following, v));
		return dot(incoming, outgoing) > Math.cos(SMOOTH_TURN) ? following : null;
	}

	/** Walks back from `start` to where its chain begins (or once round a loop): that segment and its free end. */
	private walkBack(start: number): { seg: number; v: number } {
		let seg = start;
		let v = this.segments[start]!.a;
		for (let p = this.next(seg, v); p !== null && p !== start; p = this.next(seg, v)) {
			v = this.other(p, v);
			seg = p;
		}
		return { seg, v };
	}

	/** Walks forwards from segment `seg` leaving point `v`, collecting the polyline. */
	private walkForward(first: number, from: number): MeshEdge {
		const ids = [from];
		const normals: [Vec3, Vec3][] = [];
		let closed = false;
		let v = from;
		for (let seg: number | null = first; seg !== null; ) {
			this.used.add(seg);
			v = this.other(seg, v);
			ids.push(v);
			normals.push(this.segments[seg]!.normals);
			const n: number | null = this.next(seg, v);
			closed = n !== null && this.used.has(n);
			seg = n !== null && !closed ? n : null;
		}
		return simplify(this.points, ids, normals, closed);
	}
}

/** Drops points in the middle of a straight run between the same two faces (a split edge comes back whole). */
function simplify(points: Vec3[], ids: number[], normals: [Vec3, Vec3][], closed: boolean): MeshEdge {
	const keptIds = [ids[0]!];
	const keptNormals: [Vec3, Vec3][] = [];
	for (let i = 0; i < normals.length; i++) {
		const last = keptNormals[keptNormals.length - 1];
		const from = keptIds[keptIds.length - 1]!;
		const straight =
			last !== undefined &&
			sameFaces(last, normals[i]!) &&
			sameDirection(unit(sub(points[ids[i]!]!, points[keptIds[keptIds.length - 2]!]!)), unit(sub(points[ids[i + 1]!]!, points[from]!)));
		if (straight) keptIds[keptIds.length - 1] = ids[i + 1]!;
		else {
			keptIds.push(ids[i + 1]!);
			keptNormals.push(normals[i]!);
		}
	}
	return { points: keptIds.map((id) => [...points[id]!] as Vec3), normals: keptNormals, closed };
}

/** The convex sharp edges of a closed mesh (see the module comment). */
export function sharpEdges(mesh: MeshData, limit = Number.POSITIVE_INFINITY): MeshEdge[] {
	const { points, tris } = weld(mesh);
	return new Chainer(points, sharpSegments(points, tris, limit)).edges();
}

/** Distance from point p to the segment a-b. */
function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
	const ab = sub(b, a);
	const len2 = dot(ab, ab);
	const t = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)) : 0;
	return norm(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
}

/** How close (mm) and how parallel a stored edge must be to an edge of the mesh to count as the same one. */
const PRESENT_DISTANCE = 0.01;
const PRESENT_ANGLE = (3 * Math.PI) / 180;

/**
 * Whether a stored edge (from an earlier version of the solid) is still an edge of it: every one of its segments lies along a
 * sharp edge of \`edges\` between faces facing the same ways. Used to drop a chamfer whose edge an edit has removed, rather than
 * cutting a wedge out of the wrong place.
 */
export function edgeIsPresent(edges: readonly MeshEdge[], stored: Pick<MeshEdge, 'points' | 'normals'>): boolean {
	const close = (x: Vec3, y: Vec3) => dot(x, y) > Math.cos(PRESENT_ANGLE);
	const matchFaces = (x: [Vec3, Vec3], y: [Vec3, Vec3]) =>
		(close(x[0], y[0]) && close(x[1], y[1])) || (close(x[0], y[1]) && close(x[1], y[0]));
	return stored.normals.every((faces, i) => {
		const [a, b] = [stored.points[i]!, stored.points[i + 1]!];
		const probes = [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as Vec3];
		return probes.every((p) =>
			edges.some((e) =>
				e.normals.some((n, j) => matchFaces(n, faces) && distanceToSegment(p, e.points[j]!, e.points[j + 1]!) < PRESENT_DISTANCE),
			),
		);
	});
}
