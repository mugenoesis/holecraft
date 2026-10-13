import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import { chamferedMesh } from './chamfer.ts';
import { edgeIsPresent, type MeshEdge, sharpEdges, TooManyEdges } from './edges.ts';
import type { MeshData } from './meshShape.ts';

/** A w x d x h box from x, y in +-half and z 0..h: 8 corners, 12 outward triangles. */
function boxMesh(w: number, d: number, h: number): MeshData {
	const [x, y] = [w / 2, d / 2];
	const p = [
		[-x, -y, 0],
		[x, -y, 0],
		[x, y, 0],
		[-x, y, 0],
		[-x, -y, h],
		[x, -y, h],
		[x, y, h],
		[-x, y, h],
	].flat();
	// biome-ignore format: one face per line
	const t = [
		0, 2, 1, 0, 3, 2, // bottom
		4, 5, 6, 4, 6, 7, // top
		0, 1, 5, 0, 5, 4, // front (-y)
		1, 2, 6, 1, 6, 5, // right
		2, 3, 7, 2, 7, 6, // back
		3, 0, 4, 3, 4, 7, // left
	];
	return { positions: new Float32Array(p), indices: new Uint32Array(t) };
}

const length = (e: MeshEdge) => {
	let sum = 0;
	for (let i = 0; i + 1 < e.points.length; i++)
		sum += Math.hypot(...([0, 1, 2].map((k) => e.points[i + 1]![k]! - e.points[i]![k]!) as Vec3));
	return sum;
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('sharpEdges', () => {
	it('finds the twelve edges of a box, each with the directions of its two faces', () => {
		const edges = sharpEdges(boxMesh(30, 20, 10));
		expect(edges).toHaveLength(12);
		expect(edges.every((e) => e.points.length === 2 && !e.closed)).toBe(true);
		expect(edges.map(length).sort((a, b) => a - b)).toEqual(
			[10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30].map((v) => expect.closeTo(v, 6)),
		);
		// the top front edge: between the top (+z) and the front (-y)
		const topFront = edges.find((e) => e.points.every((p) => p[2] === 10 && p[1] === -10))!;
		const n = topFront.normals[0]!;
		expect(n.map((v) => [0, 1, 2].map((k) => Math.round(v[k]!))).sort()).toEqual([
			[0, -1, 0],
			[0, 0, 1],
		]);
	});

	it('joins a straight edge that the mesh splits into pieces back into one', () => {
		// the same box, but its top and front faces share an extra point half way along the top front edge
		const m = boxMesh(30, 20, 10);
		const p = [...m.positions, 0, -10, 10];
		const mid = 8;
		// biome-ignore format: faces as triangles
		const t = [
			0, 2, 1, 0, 3, 2,
			4, 5 , 6, 4, 6, 7,
			0, 1, 5, 0, 5, mid, 0, mid, 4,
			1, 2, 6, 1, 6, 5,
			2, 3, 7, 2, 7, 6,
			3, 0, 4, 3, 4, 7,
		];
		// the top face must also use the extra point for the mesh to stay closed
		t.splice(6, 6, 4, mid, 6, mid, 5, 6, 4, 6, 7);
		const edges = sharpEdges({ positions: new Float32Array(p), indices: new Uint32Array(t) });
		expect(edges).toHaveLength(12);
		const topFront = edges.find((e) => e.points.every((q) => q[2] === 10 && q[1] === -10))!;
		expect(topFront.points).toHaveLength(2);
		expect(length(topFront)).toBeCloseTo(30);
	});

	it('links a curved rim into one closed loop', () => {
		const edges = sharpEdges(chamferedMesh('cylinder', 20, 20, 10, 2, 'top', 64));
		// three rims: bottom, where the side meets the bevel, and where the bevel meets the top
		expect(edges).toHaveLength(3);
		for (const e of edges) {
			expect(e.closed).toBe(true);
			expect(e.points).toHaveLength(65); // 64 corners and back to the start
			expect(e.normals).toHaveLength(64);
		}
	});

	it('ignores gentle creases: the facets around a cylinder are not edges', () => {
		const edges = sharpEdges(chamferedMesh('cylinder', 20, 20, 10, 2, 'top', 64));
		expect(edges.every((e) => e.points.every((q) => q[2] === 0 || q[2] === 8 || q[2] === 10))).toBe(true);
	});

	it('only offers outward (convex) edges, not the inside corner of an L', () => {
		// An L made of two boxes would need CSG; a simple stand-in: a mesh with one concave edge between two faces.
		// The inside corner of a step: a floor at z=0 for x > 0 meeting a wall at x = 0 rising from it.
		// biome-ignore format: points
		const p = [
			0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, // floor
			0, 0, 10, 0, 10, 10, // top of the wall
		];
		// floor faces up, wall faces +x: they meet along x = 0, z = 0, a concave edge
		const t = [0, 1, 2, 0, 2, 3, 0, 3, 5, 0, 5, 4];
		const edges = sharpEdges({ positions: new Float32Array(p), indices: new Uint32Array(t) });
		expect(edges).toHaveLength(0);
	});

	it('gives every edge face directions that point outwards (a box edge: one up, one sideways)', () => {
		for (const e of sharpEdges(boxMesh(10, 10, 10))) {
			for (const [a, b] of e.normals) {
				expect(Math.hypot(...a)).toBeCloseTo(1);
				expect(Math.hypot(...b)).toBeCloseTo(1);
				expect(dot(a, b)).toBeCloseTo(0);
			}
		}
	});
});

describe('edgeIsPresent', () => {
	const edges = sharpEdges(boxMesh(30, 20, 10));
	const topFront = edges.find((e) => e.points.every((p) => p[2] === 10 && p[1] === -10))!;

	it('recognises an edge that is still there', () => {
		expect(edgeIsPresent(edges, topFront)).toBe(true);
	});

	it('recognises it after a re-mesh splits it', () => {
		const shorter = { ...topFront, points: [topFront.points[0]!, [0, -10, 10] as Vec3] };
		expect(edgeIsPresent(edges, shorter)).toBe(true);
	});

	it('rejects an edge that moved, or whose faces now meet at another angle', () => {
		const moved = { ...topFront, points: topFront.points.map((p) => [p[0], p[1] + 3, p[2]] as Vec3) };
		expect(edgeIsPresent(edges, moved)).toBe(false);
		const turned = { ...topFront, normals: topFront.normals.map(([a]) => [a, [Math.SQRT1_2, 0, Math.SQRT1_2]] as [Vec3, Vec3]) };
		expect(edgeIsPresent(edges, turned)).toBe(false);
	});

	it('is false against a mesh with no edges at all', () => {
		expect(edgeIsPresent([], topFront)).toBe(false);
	});
});

describe('sharpEdges with a limit', () => {
	it('gives up as soon as there are more sharp pieces than the limit, and not before', () => {
		const box = boxMesh(10, 10, 10);
		expect(sharpEdges(box, 12)).toHaveLength(12);
		expect(() => sharpEdges(box, 11)).toThrow(TooManyEdges);
	});
});
