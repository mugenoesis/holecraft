import { describe, expect, it } from 'vitest';
import { meshHealth, repairMesh } from './meshRepair.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';

/** A box from (0,0,0) to (w,d,h) as 8 corners and 12 triangles facing outwards. */
function box(w = 1, d = 1, h = 1, at: [number, number, number] = [0, 0, 0]): MeshData {
	const [x, y, z] = at;
	const positions = new Float32Array([
		x,
		y,
		z,
		x + w,
		y,
		z,
		x + w,
		y + d,
		z,
		x,
		y + d,
		z, //
		x,
		y,
		z + h,
		x + w,
		y,
		z + h,
		x + w,
		y + d,
		z + h,
		x,
		y + d,
		z + h,
	]);
	const indices = new Uint32Array([
		0,
		2,
		1,
		0,
		3,
		2, // bottom (faces down)
		4,
		5,
		6,
		4,
		6,
		7, // top
		0,
		1,
		5,
		0,
		5,
		4, // front
		1,
		2,
		6,
		1,
		6,
		5, // right
		2,
		3,
		7,
		2,
		7,
		6, // back
		3,
		0,
		4,
		3,
		4,
		7, // left
	]);
	return { positions, indices };
}

const without = (m: MeshData, triangle: number[]): MeshData => {
	const keep: number[] = [];
	for (let t = 0; t < m.indices.length / 3; t++) if (!triangle.includes(t)) keep.push(...m.indices.slice(t * 3, t * 3 + 3));
	return { positions: m.positions, indices: Uint32Array.from(keep) };
};

const turned = (m: MeshData, triangles: number[]): MeshData => {
	const indices = Uint32Array.from(m.indices);
	for (const t of triangles) [indices[t * 3 + 1], indices[t * 3 + 2]] = [indices[t * 3 + 2]!, indices[t * 3 + 1]!];
	return { positions: m.positions, indices };
};

/** Two meshes in one, the second's corners numbered after the first's. */
const joined = (a: MeshData, b: MeshData): MeshData => {
	const positions = new Float32Array(a.positions.length + b.positions.length);
	positions.set(a.positions);
	positions.set(b.positions, a.positions.length);
	const shift = a.positions.length / 3;
	return { positions, indices: Uint32Array.from([...a.indices, ...Array.from(b.indices, (i) => i + shift)]) };
};

describe('meshHealth', () => {
	it('calls a closed box healthy', () => {
		expect(meshHealth(box())).toEqual({
			triangles: 12,
			openEdges: 0,
			nonManifoldEdges: 0,
			flippedEdges: 0,
			degenerate: 0,
			insideOut: 0,
			closed: true,
		});
	});

	it('counts the open edges of a box with a missing triangle', () => {
		const h = meshHealth(without(box(), [0]));
		expect(h.openEdges).toBe(3);
		expect(h.closed).toBe(false);
	});

	it('counts a flipped triangle as edges its neighbours disagree about', () => {
		const h = meshHealth(turned(box(), [4]));
		expect(h.flippedEdges).toBe(3);
		expect(h.closed).toBe(false);
	});

	it('counts the triangles of a piece that is inside out', () => {
		const inside = turned(
			box(),
			Array.from({ length: 12 }, (_, i) => i),
		);
		const h = meshHealth(inside);
		expect(h.insideOut).toBe(12);
		expect(h.openEdges + h.flippedEdges).toBe(0);
		expect(h.closed).toBe(false);
	});

	it('counts triangles with no area', () => {
		const m = box();
		const degenerate: MeshData = { positions: m.positions, indices: Uint32Array.from([...m.indices, 0, 0, 1]) };
		expect(meshHealth(degenerate).degenerate).toBe(1);
		expect(meshHealth(degenerate).closed).toBe(false);
	});

	it('counts an edge shared by three triangles', () => {
		const m = box();
		const fin: MeshData = {
			positions: new Float32Array([...m.positions, 5, 5, 5]),
			indices: Uint32Array.from([...m.indices, 0, 1, 8]),
		};
		expect(meshHealth(fin).nonManifoldEdges).toBe(1);
		expect(meshHealth(fin).closed).toBe(false);
	});
});

describe('repairMesh', () => {
	it('fills a hole left by a missing triangle, and the box is the box again', () => {
		const out = repairMesh(without(box(2, 3, 4), [0]));
		expect(out.health.closed).toBe(true);
		expect(out.fixed.holesFilled).toBe(1);
		expect(signedVolume(out.mesh)).toBeCloseTo(24, 4);
	});

	it('fills a missing face (a four-sided hole)', () => {
		const out = repairMesh(without(box(2, 3, 4), [2, 3]));
		expect(out.health.closed).toBe(true);
		expect(out.fixed.holesFilled).toBe(1);
		expect(out.mesh.indices.length / 3).toBe(12);
		expect(signedVolume(out.mesh)).toBeCloseTo(24, 4);
	});

	it('turns a flipped triangle back', () => {
		const out = repairMesh(turned(box(2, 3, 4), [5]));
		expect(out.health.closed).toBe(true);
		expect(out.fixed.flippedFaces).toBeGreaterThanOrEqual(1);
		expect(signedVolume(out.mesh)).toBeCloseTo(24, 4);
	});

	it('turns a whole shell that is inside out', () => {
		const inside = turned(
			box(2, 3, 4),
			Array.from({ length: 12 }, (_, i) => i),
		);
		expect(signedVolume(inside)).toBeLessThan(0);
		const out = repairMesh(inside);
		expect(signedVolume(out.mesh)).toBeCloseTo(24, 4);
		expect(out.health.closed).toBe(true);
	});

	it('repairs each separate piece on its own', () => {
		const good = box(1, 1, 1);
		const bad = turned(box(1, 1, 1, [5, 0, 0]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		const out = repairMesh(joined(good, bad));
		expect(out.health.closed).toBe(true);
		expect(signedVolume(out.mesh)).toBeCloseTo(2, 4);
	});

	it('drops triangles with no area', () => {
		const m = box();
		const degenerate: MeshData = { positions: m.positions, indices: Uint32Array.from([...m.indices, 0, 0, 1, 2, 3, 3]) };
		const out = repairMesh(degenerate);
		expect(out.fixed.degenerateRemoved).toBe(2);
		expect(out.health.closed).toBe(true);
		expect(out.mesh.indices.length / 3).toBe(12);
	});

	it('fills a notched (L-shaped) hole without covering the notch', () => {
		// an L prism, 1 high, made without its top
		const L: [number, number][] = [
			[0, 0],
			[2, 0],
			[2, 1],
			[1, 1],
			[1, 2],
			[0, 2],
		];
		const n = L.length;
		const positions = new Float32Array(n * 2 * 3);
		L.forEach(([x, y], i) => {
			positions.set([x, y, 0], i * 3);
			positions.set([x, y, 1], (n + i) * 3);
		});
		const tri: number[] = [];
		// bottom: fan, facing down (the L is counter-clockwise seen from above, so reverse it)
		for (const [a, b, c] of [
			[0, 2, 1],
			[0, 3, 2],
			[0, 4, 3],
			[0, 5, 4],
		] as const)
			tri.push(a, b, c);
		// the walls, outwards
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n;
			tri.push(i, j, n + j, i, n + j, n + i);
		}
		const open: MeshData = { positions, indices: Uint32Array.from(tri) };
		expect(meshHealth(open).openEdges).toBe(6);
		const out = repairMesh(open);
		expect(out.health.closed).toBe(true);
		expect(out.fixed.holesFilled).toBe(1);
		expect(signedVolume(out.mesh)).toBeCloseTo(3, 4); // the L has an area of 3
	});

	it('leaves a mesh that is already closed exactly as it is', () => {
		const m = box(2, 3, 4);
		const out = repairMesh(m);
		expect(out.mesh).toBe(m);
		expect(out.fixed).toEqual({ flippedFaces: 0, degenerateRemoved: 0, holesFilled: 0, holesLeft: 0 });
	});

	it('says what it could not mend: an edge three triangles share stays', () => {
		const m = box();
		const fin: MeshData = {
			positions: new Float32Array([...m.positions, 5, 5, 5]),
			indices: Uint32Array.from([...m.indices, 0, 1, 8]),
		};
		const out = repairMesh(fin);
		expect(out.health.nonManifoldEdges).toBeGreaterThan(0);
		expect(out.health.closed).toBe(false);
	});

	it('does not change the mesh it is given', () => {
		const m = without(box(), [0]);
		const before = Array.from(m.indices);
		repairMesh(m);
		expect(Array.from(m.indices)).toEqual(before);
	});
});
