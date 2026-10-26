import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { findClosedCavity } from './cavities.ts';
import { loadManifold } from './load.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

type Vec = [number, number, number];

/** A 30 x 30 x 20 mm block (its base on the plane) with some boxes cut out of it, as a mesh. */
function block(cuts: { size: Vec; at: Vec }[]): GroupMesh {
	let solid = M.Manifold.cube([30, 30, 20]);
	for (const cut of cuts) solid = solid.subtract(M.Manifold.cube(cut.size).translate(cut.at));
	const mesh = solid.getMesh();
	const positions = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
	for (let i = 0; i < positions.length / 3; i++) {
		for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k]!;
	}
	return { positions, indices: new Uint32Array(mesh.triVerts) };
}

/** A sealed void in the middle of the block, 16 x 16 x 10 mm from 5 mm up. */
const VOID = { size: [16, 16, 10] as Vec, at: [7, 7, 5] as Vec };

describe('findClosedCavity', () => {
	it('finds nothing in a solid block', () => {
		expect(findClosedCavity(M, block([]))).toBeNull();
	});

	it('finds a sealed void, where it begins', () => {
		const found = findClosedCavity(M, block([VOID]));
		expect(found?.areaMm2).toBeCloseTo(256, 0);
		expect(found?.z).toBeGreaterThan(5);
		expect(found?.z).toBeLessThan(6);
	});

	it('finds a pocket in the top, which faces the film as it is built', () => {
		const found = findClosedCavity(M, block([{ size: [16, 16, 16], at: [7, 7, 5] }]));
		expect(found?.areaMm2).toBeCloseTo(256, 0);
	});

	it('takes the model to stand clear of the plate, so a pocket open at its base is open', () => {
		expect(findClosedCavity(M, block([{ size: [16, 16, 16], at: [7, 7, -1] }]))).toBeNull();
	});

	it('ignores a cavity under the minimum area', () => {
		expect(findClosedCavity(M, block([{ size: [4, 4, 6], at: [13, 13, 5] }]))).toBeNull();
	});

	it('leaves a void with a channel down to the base alone', () => {
		const channel = { size: [2, 2, 7] as Vec, at: [14, 14, -1] as Vec };
		expect(findClosedCavity(M, block([VOID, channel]))).toBeNull();
	});

	it('leaves a void with a channel out of the side, from its floor, alone', () => {
		const channel = { size: [10, 4, 4] as Vec, at: [-1, 13, 5] as Vec };
		expect(findClosedCavity(M, block([VOID, channel]))).toBeNull();
	});

	it('still finds a void when a channel leads up to it from the top, which is the film side', () => {
		const channel = { size: [2, 2, 7] as Vec, at: [14, 14, 14] as Vec };
		expect(findClosedCavity(M, block([VOID, channel]))?.areaMm2).toBeCloseTo(256, 0);
	});

	it('reports the largest cavity', () => {
		const cuts = [
			{ size: [5, 5, 6] as Vec, at: [2, 2, 5] as Vec },
			{ size: [12, 12, 6] as Vec, at: [15, 15, 5] as Vec },
		];
		expect(findClosedCavity(M, block(cuts))?.areaMm2).toBeCloseTo(144, 0);
	});
});
