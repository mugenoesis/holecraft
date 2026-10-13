import { addShape, createEmptyDesign, type Design, groupNodes, setShapeParam, setShapeSize } from '@holecraft/core';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
import { loadManifold } from './load.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

const asManifold = (mesh: GroupMesh): Manifold => {
	const m = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
	expect(m.status()).toBe('NoError');
	return m;
};

function threaded(type: 'threaded-rod' | 'threaded-hole', settings: Record<string, number>, length: number): Design {
	let d = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	for (const [key, value] of Object.entries(settings)) d = setShapeParam(d, 'a', key, value);
	return setShapeSize(d, 'a', { height: length });
}

describe('a screw and its threaded hole', () => {
	const rod = (size: number) => asManifold(evaluateNode(M, threaded('threaded-rod', { size }, 12), 'a')!);

	for (const size of [3, 5, 8]) {
		for (const fit of [1, 2, 3]) {
			it(`M${size} at fit ${fit}: the rod fits inside the hole’s cutter with no overlap, turned the way the thread goes`, () => {
				const screw = rod(size);
				const cutter = asManifold(evaluateNode(M, threaded('threaded-hole', { size, fit }, 12), 'a')!);
				expect(screw.intersect(cutter).volume()).toBeCloseTo(screw.volume(), 3); // the screw is wholly inside the cutter
				expect(cutter.volume()).toBeGreaterThan(screw.volume());
			});
		}
	}

	it('a thread out of step with its hole (half a pitch along) does not fit: the thread would have to be cut', () => {
		const screw = rod(5);
		const cutter = asManifold(evaluateNode(M, threaded('threaded-hole', { size: 5, fit: 2 }, 12), 'a')!);
		const offset = cutter.translate([0, 0, 0.4]); // half the 0.8 mm pitch
		const lost = screw.volume() - screw.intersect(offset).volume();
		expect(lost).toBeGreaterThan(screw.volume() * 0.02);
	});

	it('a threaded hole cut from a block leaves the block minus the cutter, and a screw dropped in it then fits with a gap', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 30, depth: 30, height: 12 });
		d = addShape(d, 'threaded-hole', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { height: 12 });
		const cutter = asManifold(evaluateNode(M, d, 'h')!);
		const g = groupNodes(d, ['b', 'h'], { id: 'g' }).design;
		const block = asManifold(evaluateGroup(M, g, 'g')!);
		expect(block.volume()).toBeCloseTo(30 * 30 * 12 - cutter.volume(), 1);
		const screw = rod(5);
		expect(block.intersect(screw).volume()).toBeLessThan(screw.volume() * 1e-4);
	});

	it('keeps the thread over a long length: a 60 mm screw is as accurate as a 12 mm one (same volume per mm)', () => {
		const short = asManifold(evaluateNode(M, threaded('threaded-rod', { size: 5 }, 12), 'a')!);
		const long = asManifold(evaluateNode(M, threaded('threaded-rod', { size: 5 }, 60), 'a')!);
		expect(long.volume() / 60).toBeCloseTo(short.volume() / 12, 1);
	});
});
