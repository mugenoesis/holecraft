import type { MeshData } from './meshShape.ts';

/**
 * Turns every separate piece (shell) of a mesh to face the right way. A model can hold several shells, and a file can get
 * some of them inside out (a mirrored copy written without turning its triangles round), so checking the whole model at
 * once is not enough: the good pieces outweigh the bad. The right way depends on nesting, since a hollow is a shell facing
 * inwards: a shell enclosed by an even number of others (none, for a plain piece) must enclose a positive volume, one
 * enclosed by an odd number (a hollow's inner wall) a negative one.
 */

interface Shell {
	triangles: number[];
	volume: number;
	min: [number, number, number];
	max: [number, number, number];
}

/** Groups triangles into shells: triangles sharing a corner are in the same shell. */
function shellsOf(mesh: MeshData): Shell[] {
	const parent = Int32Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
	const find = (x: number): number => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x]!]!;
			x = parent[x]!;
		}
		return x;
	};
	const { indices } = mesh;
	for (let t = 0; t + 2 < indices.length; t += 3) {
		const a = find(indices[t]!);
		parent[find(indices[t + 1]!)] = a;
		parent[find(indices[t + 2]!)] = a;
	}
	const byRoot = new Map<number, Shell>();
	for (let t = 0; t + 2 < indices.length; t += 3) {
		const root = find(indices[t]!);
		let shell = byRoot.get(root);
		if (!shell) {
			shell = { triangles: [], volume: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
			byRoot.set(root, shell);
		}
		addTriangle(shell, mesh, t);
	}
	return [...byRoot.values()];
}

function addTriangle(shell: Shell, { positions: p, indices }: MeshData, t: number): void {
	shell.triangles.push(t);
	const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
	shell.volume +=
		(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
			p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
			p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
		6;
	for (const v of [a, b, c]) {
		for (let k = 0; k < 3; k++) {
			shell.min[k] = Math.min(shell.min[k]!, p[v + k]!);
			shell.max[k] = Math.max(shell.max[k]!, p[v + k]!);
		}
	}
}

/** True when `inner`'s box lies within `outer`'s (a cheap test before the exact one). */
const boxWithin = (inner: Shell, outer: Shell) => [0, 1, 2].every((k) => inner.min[k]! >= outer.min[k]! && inner.max[k]! <= outer.max[k]!);

/** A ray direction unlikely to run exactly along an edge or through a corner of real models. */
const RAY = (() => {
	const d = [1, 0.000_123_7, 0.000_457_1];
	const n = Math.hypot(...d);
	return d.map((v) => v / n) as [number, number, number];
})();

/** Whether point `o` is inside closed shell `s`: a ray from it crosses the shell an odd number of times. */
function encloses(mesh: MeshData, s: Shell, o: [number, number, number]): boolean {
	const { positions: p, indices } = mesh;
	let crossings = 0;
	for (const t of s.triangles) {
		const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
		if (rayHits(o, [p[a]!, p[a + 1]!, p[a + 2]!], [p[b]!, p[b + 1]!, p[b + 2]!], [p[c]!, p[c + 1]!, p[c + 2]!])) crossings++;
	}
	return crossings % 2 === 1;
}

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Möller–Trumbore: does the ray from `o` along RAY cross triangle a-b-c (ahead of `o`)? */
function rayHits(o: V, a: V, b: V, c: V): boolean {
	const e1 = sub(b, a);
	const e2 = sub(c, a);
	const h = cross(RAY, e2);
	const det = dot(e1, h);
	if (Math.abs(det) < 1e-12) return false;
	const s = sub(o, a);
	const u = dot(s, h) / det;
	if (u < 0 || u > 1) return false;
	const q = cross(s, e1);
	const v = dot(RAY, q) / det;
	if (v < 0 || u + v > 1) return false;
	return dot(e2, q) / det > 1e-9;
}

/** How many other shells enclose `shell`. */
function depthOf(mesh: MeshData, shells: readonly Shell[], shell: Shell): number {
	const corner = mesh.indices[shell.triangles[0]!]! * 3;
	const o: V = [mesh.positions[corner]!, mesh.positions[corner + 1]!, mesh.positions[corner + 2]!];
	return shells.filter((other) => other !== shell && boxWithin(shell, other) && encloses(mesh, other, o)).length;
}

/** The mesh's triangle indices with every shell facing the right way (a new array; the mesh is not changed). */
export function faceShellsOutwards(mesh: MeshData): Uint32Array {
	const indices = Uint32Array.from(mesh.indices);
	const shells = shellsOf(mesh);
	for (const shell of shells) {
		const wantPositive = depthOf(mesh, shells, shell) % 2 === 0;
		if (shell.volume === 0 || shell.volume > 0 === wantPositive) continue;
		for (const t of shell.triangles) {
			const b = indices[t + 1]!;
			indices[t + 1] = indices[t + 2]!;
			indices[t + 2] = b;
		}
	}
	return indices;
}
