import { addMeshShape, createEmptyDesign, flipNodes, type MeshData, normalizeMesh } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateNode } from './evaluate.ts';
import { loadManifold } from './load.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

const tetra: MeshData = {
	positions: new Float32Array([100, 100, 5, 110, 100, 5, 100, 120, 5, 100, 100, 35]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};
const { mesh, size } = normalizeMesh(tetra);
const REF = 'a'.repeat(64);
const meshes = new Map([[REF, mesh]]);
const design = () => addMeshShape(createEmptyDesign('d'), { name: 'Bracket', ref: REF, size }, { at: [50, 20], id: 'm' }).design;

const volume = (m: GroupMesh) => {
	let sum = 0;
	for (let i = 0; i < m.indices.length; i += 3) {
		const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
		const p = m.positions;
		sum +=
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
};
/** The distinct corners of a built shape, rounded, as strings so two shapes' corners can be compared as sets. */
const cornerSet = (m: GroupMesh, map: (p: number[]) => number[] = (p) => p) =>
	new Set(
		Array.from({ length: m.positions.length / 3 }, (_, i) =>
			map([m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!])
				.map((v) => (Math.round(v * 1e3) / 1e3 + 0).toFixed(3))
				.join(','),
		),
	);

describe('a flipped imported model in the CSG engine', () => {
	it('is built as the mirror image: its corners are the original corners reflected in the plane through the middle of its box', () => {
		const before = evaluateNode(M, design(), 'm', meshes)!;
		const after = evaluateNode(M, flipNodes(design(), ['m'], 'x'), 'm', meshes)!;
		// the model is 10 wide at x = 50, so Flip X reflects across x = 50
		expect(cornerSet(after)).toEqual(cornerSet(before, (p) => [100 - p[0]!, p[1]!, p[2]!]));
		expect(cornerSet(after)).not.toEqual(cornerSet(before)); // not just a turned copy of itself
	});

	it('keeps its volume and its outward facing, and flipped twice is the original', () => {
		const once = flipNodes(design(), ['m'], 'y');
		const [a, b, c] = [design(), once, flipNodes(once, ['m'], 'y')].map((d) => evaluateNode(M, d, 'm', meshes)!);
		expect(volume(b!)).toBeCloseTo(volume(a!), 3);
		expect(volume(b!)).toBeGreaterThan(0);
		expect(cornerSet(c!)).toEqual(cornerSet(a!));
	});
});
