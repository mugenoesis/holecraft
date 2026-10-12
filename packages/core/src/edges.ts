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

/** Welds coinciding points, so triangles that touch share corner ids. */
function weld(mesh: MeshData): { points: Vec3[]; tris: [number, number, number][] } {
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
	const tris: [number, number, number][] = [];
	for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
		const t: [number, number, number] = [idOf(mesh.indices[i]!), idOf(mesh.indices[i + 1]!), idOf(mesh.indices[i + 2]!)];
		if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) tris.push(t);
	}
	return { points, tris };
}

interface Segment {
	a: number;
	b: number;
	normals: [Vec3, Vec3];
}

/** The convex sharp mesh edges: pairs of triangles sharing a side whose faces meet at more than SHARP_ANGLE. */
function sharpSegments(points: Vec3[], tris: [number, number, number][]): Segment[] {
	const faceNormals = tris.map(([a, b, c]) => unit(cross(sub(points[b]!, points[a]!), sub(points[c]!, points[a]!))));
	const sides = new Map<string, number[]>();
	tris.forEach((t, ti) => {
		for (let k = 0; k < 3; k++) {
			const [a, b] = [t[k]!, t[(k + 1) % 3]!];
			const key = a < b ? `${a},${b}` : `${b},${a}`;
			const list = sides.get(key);
			if (list) list.push(ti);
			else sides.set(key, [ti]);
		}
	});
	const segments: Segment[] = [];
	for (const [key, owners] of sides) {
		if (owners.length !== 2) continue;
		const [t1, t2] = owners as [number, number];
		const [n1, n2] = [faceNormals[t1]!, faceNormals[t2]!];
		if (!(dot(n1, n2) < Math.cos(SHARP_ANGLE))) continue;
		const [a, b] = key.split(',').map(Number) as [number, number];
		// convex when the second face's far corner lies below the first face
		const far = tris[t2]!.find((v) => v !== a && v !== b)!;
		if (dot(sub(points[far]!, points[a]!), n1) >= -1e-9) continue;
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
export function sharpEdges(mesh: MeshData): MeshEdge[] {
	const { points, tris } = weld(mesh);
	return new Chainer(points, sharpSegments(points, tris)).edges();
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
