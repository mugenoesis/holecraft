import { addShape, createEmptyDesign, type Design, groupNodes, setNodeMode, setShapeSize } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
import { loadManifold } from './load.ts';
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

/** One shape of the given kind, 30 wide, 20 deep and 10 tall. */
const shaped = (type: Parameters<typeof addShape>[1]): Design =>
	setShapeSize(addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design, 'a', { width: 30, depth: 20, height: 10 });

const N = 64;
/** Volumes at 30 x 20 x 10, worked out from each shape's dimensions (a faceted round shape falls a little short of the true one). */
const EXPECTED = {
	pyramid: { volume: (30 * 20 * 10) / 3, relative: 1e-4 },
	wedge: { volume: (30 * 20 * 10) / 2, relative: 1e-4 },
	roof: { volume: (30 * 20 * 10) / 2, relative: 1e-4 },
	cone: { volume: ((N / 2) * 15 * 10 * Math.sin((2 * Math.PI) / N) * 10) / 3, relative: 1e-4 },
	'half-sphere': { volume: (2 / 3) * Math.PI * 15 * 10 * 10, relative: 0.015 },
	'round-roof': { volume: ((Math.PI * 15 * 10) / 2) * 20, relative: 0.01 }, // half an ellipse (15 wide, 10 high) is pi * 15 * 10 / 2, 20 long
} as const;

describe('the basic shapes in the CSG engine', () => {
	for (const [type, { volume: expected, relative }] of Object.entries(EXPECTED)) {
		it(`${type}: stretched to its size, it has the volume its dimensions give`, () => {
			const mesh = evaluateNode(M, shaped(type as keyof typeof EXPECTED), 'a')!;
			expect(Math.abs(volume(mesh) - expected) / expected).toBeLessThan(relative);
		});
	}

	it('are placed by their transform (exported where they are) but built in their own frame on their own', () => {
		let d = shaped('wedge');
		d = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 0, 1] } } };
		const placed = evaluateNode(M, d, 'a')!;
		const xs = Array.from(placed.positions).filter((_, i) => i % 3 === 0);
		expect([Math.min(...xs), Math.max(...xs)]).toEqual([35, 65]);
	});

	it('are cut by holes like any shape: a box hole through the middle of a cone', () => {
		let d = shaped('cone');
		d = addShape(d, 'box', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { width: 4, depth: 4, height: 40 });
		d = setNodeMode(d, ['h'], 'hole');
		const { design } = groupNodes(d, ['a', 'h'], { id: 'g' });
		const cut = volume(evaluateGroup(M, design, 'g')!);
		// The 4 x 4 column is 160 mm3 over the cone's 10 mm. Its corner (2, 2) is inside the cone up to where the cone's ellipse
		// (15 x 10 at the base, shrinking to a point) narrows to 24% of its size, which is 76% of the height, so at least 7.6 mm of the
		// column is entirely inside; above that only part of it is.
		const plain = volume(evaluateNode(M, shaped('cone'), 'a')!);
		expect(plain - cut).toBeGreaterThan(16 * 7.59);
		expect(plain - cut).toBeLessThan(160);
	});
});
