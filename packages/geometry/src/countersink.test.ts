import { addShape, createEmptyDesign, type Design, groupNodes, setNodeMode, setShapeCountersink, setShapeSize } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { loadManifold } from './load.ts';
import { subtreeHash } from './subtree.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

function volume(mesh: GroupMesh): number {
	const p = mesh.positions;
	let sum = 0;
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const [a, b, c] = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
		sum +=
			p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
			p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
			p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
	}
	return sum / 6;
}

/** A 40 x 40 x 20 block with a 6 mm hole right through its middle, grouped. The hole gets the given countersink. */
function block(countersink?: { size: number; end?: 'top' | 'bottom' | 'both' }): { d: Design; g: string } {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'b' }).design;
	d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 20 });
	d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
	d = setShapeSize(d, 'h', { width: 6, depth: 6, height: 20 });
	d = setNodeMode(d, ['h'], 'hole');
	if (countersink) d = setShapeCountersink(d, 'h', countersink);
	return { d: groupNodes(d, ['b', 'h'], { id: 'g' }).design, g: 'g' };
}

const N = 64;
/** Area of an N-sided polygon inscribed in a circle of radius r. */
const disc = (r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
/** Volume of a flare from radius r growing by t (0 to s) over height s, by hand: the integral of disc(r + t) dt. */
const flare = (r: number, s: number) => (N / 2) * Math.sin((2 * Math.PI) / N) * (r * r * s + r * s * s + (s * s * s) / 3);

describe('countersunk holes in a group', () => {
	const plain = () => volume(evaluateGroup(M, block().d, block().g)!);

	it('cut the plain hole plus the flare: 6 mm hole, 3 mm countersink at the top', () => {
		const { d, g } = block({ size: 3 });
		expect(plain() - volume(evaluateGroup(M, d, g)!)).toBeCloseTo(flare(3, 3) - disc(3) * 3, 2);
	});

	it('flare the bottom, or both ends, by the same amount', () => {
		const extra = flare(3, 3) - disc(3) * 3;
		for (const [end, count] of [
			['bottom', 1],
			['both', 2],
		] as const) {
			const { d, g } = block({ size: 3, end });
			expect(plain() - volume(evaluateGroup(M, d, g)!)).toBeCloseTo(extra * count, 2);
		}
	});

	it('a long flare (12 mm of the 20 mm hole, opening to a 15 mm radius, still inside the block) cuts its whole cone', () => {
		const { d, g } = block({ size: 12 });
		expect(plain() - volume(evaluateGroup(M, d, g)!)).toBeCloseTo(flare(3, 12) - disc(3) * 12, 1);
	});

	it('changes the cache key, so a countersunk group is never shown with an old result', () => {
		const { d, g } = block();
		const sunk = block({ size: 3 });
		expect(subtreeHash(sunk.d, sunk.g)).not.toBe(subtreeHash(d, g));
		expect(subtreeHash(block({ size: 3, end: 'both' }).d, g)).not.toBe(subtreeHash(sunk.d, g));
	});
});
