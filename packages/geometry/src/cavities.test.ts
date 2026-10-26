import { signedVolume } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { findClosedCavities } from './cavities.ts';
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

const largest = (mesh: GroupMesh) => findClosedCavities(M, mesh)[0] ?? null;

describe('findClosedCavities', () => {
	it('finds nothing in a solid block', () => {
		expect(largest(block([]))).toBeNull();
	});

	it('finds a sealed void, where it begins', () => {
		const found = largest(block([VOID]));
		expect(found?.areaMm2).toBeCloseTo(256, 0);
		expect(found?.z).toBeGreaterThan(5);
		expect(found?.z).toBeLessThan(6);
	});

	it('finds a pocket in the top, which faces the film as it is built', () => {
		const found = largest(block([{ size: [16, 16, 16], at: [7, 7, 5] }]));
		expect(found?.areaMm2).toBeCloseTo(256, 0);
	});

	it('takes the model to stand clear of the plate, so a pocket open at its base is open', () => {
		expect(largest(block([{ size: [16, 16, 16], at: [7, 7, -1] }]))).toBeNull();
	});

	it('ignores a cavity under the minimum area', () => {
		expect(largest(block([{ size: [4, 4, 6], at: [13, 13, 5] }]))).toBeNull();
	});

	it('leaves a void with a channel down to the base alone', () => {
		const channel = { size: [2, 2, 7] as Vec, at: [14, 14, -1] as Vec };
		expect(largest(block([VOID, channel]))).toBeNull();
	});

	it('leaves a void with a channel out of the side, from its floor, alone', () => {
		const channel = { size: [10, 4, 4] as Vec, at: [-1, 13, 5] as Vec };
		expect(largest(block([VOID, channel]))).toBeNull();
	});

	it('still finds a void when a channel leads up to it from the top, which is the film side', () => {
		const channel = { size: [2, 2, 7] as Vec, at: [14, 14, 14] as Vec };
		expect(largest(block([VOID, channel]))?.areaMm2).toBeCloseTo(256, 0);
	});

	it('reports the largest cavity', () => {
		const cuts = [
			{ size: [5, 5, 6] as Vec, at: [2, 2, 5] as Vec },
			{ size: [12, 12, 6] as Vec, at: [15, 15, 5] as Vec },
		];
		expect(largest(block(cuts))?.areaMm2).toBeCloseTo(144, 0);
	});

	it('gives every cavity of its own, the largest first, and a tall one is only one cavity', () => {
		const cuts = [
			{ size: [6, 6, 6] as Vec, at: [2, 2, 5] as Vec },
			{ size: [12, 12, 6] as Vec, at: [15, 15, 5] as Vec },
		];
		const found = findClosedCavities(M, block(cuts));
		expect(found.map((c) => Math.round(c.areaMm2))).toEqual([144, 36]);
		expect(new Set(found.map((c) => c.id)).size).toBe(2);
		expect(findClosedCavities(M, block([VOID]))).toHaveLength(1);
	});

	it('joins two columns a bridge higher up connects into one cavity', () => {
		const cuts = [
			{ size: [8, 8, 5] as Vec, at: [2, 2, 5] as Vec },
			{ size: [8, 8, 5] as Vec, at: [18, 2, 5] as Vec },
			{ size: [18, 2, 2] as Vec, at: [6, 5, 8] as Vec },
		];
		expect(findClosedCavities(M, block(cuts))).toHaveLength(1);
	});

	it('gives the solid that fills a cavity: just its size', () => {
		const [cavity] = findClosedCavities(M, block([VOID]));
		const { positions } = cavity!.fill;
		const z = Array.from({ length: positions.length / 3 }, (_, i) => positions[i * 3 + 2]!);
		expect(Math.min(...z)).toBeCloseTo(5, 2);
		expect(Math.max(...z)).toBeCloseTo(15, 2);
		expect(signedVolume(cavity!.fill)).toBeCloseTo(2560, 0);
	});

	it('fills a round cavity to its wall, with no sliver left between the steps', () => {
		const ball = M.Manifold.sphere(8, 64).translate([15, 15, 10]);
		const m = M.Manifold.cube([30, 30, 20]).subtract(ball).getMesh();
		const positions = new Float32Array((m.vertProperties.length / m.numProp) * 3);
		for (let i = 0; i < positions.length / 3; i++) {
			for (let k = 0; k < 3; k++) positions[i * 3 + k] = m.vertProperties[i * m.numProp + k]!;
		}
		const [cavity] = findClosedCavities(M, { positions, indices: new Uint32Array(m.triVerts) });
		expect(Math.abs(signedVolume(cavity!.fill) - ball.volume()) / ball.volume()).toBeLessThan(0.002);
		// joined to the shape (as the exporter will) nothing is left inside it
		const plug = new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: cavity!.fill.positions, triVerts: cavity!.fill.indices }));
		expect(new M.Manifold(m).add(plug).volume()).toBeCloseTo(18000, -1);
	});
});
