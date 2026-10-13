import {
	addShape,
	createEmptyDesign,
	type Design,
	groupNodes,
	type ShapeNode,
	setShapeParam,
	setShapeSize,
	withSimpleThreads,
} from '@holecraft/core';
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

describe('a bolt and its nut', () => {
	const bolt = (size: number, head: number, shank: number): Design => {
		let d = addShape(createEmptyDesign('d'), 'bolt', [0, 0], { id: 'a' }).design;
		d = setShapeParam(d, 'a', 'size', size);
		d = setShapeParam(d, 'a', 'head', head);
		const offset = Number((d.nodes.a as ShapeNode).params.height) - 20;
		return setShapeSize(d, 'a', { height: shank + offset });
	};
	const nut = (size: number, fit: number): Design =>
		setShapeParam(setShapeParam(addShape(createEmptyDesign('d'), 'nut', [0, 0], { id: 'a' }).design, 'a', 'size', size), 'a', 'fit', fit);
	/** The pitch of each size, which the nut has to be moved up by a whole number of to line its thread up with the bolt's. */
	const PITCH: Record<number, number> = { 3: 0.5, 5: 0.8, 8: 1.25 };

	for (const size of [3, 5, 8]) {
		for (const head of [1, 2]) {
			for (const fit of [1, 2, 3]) {
				it(`M${size}, head ${head}, fit ${fit}: the nut sits on the bolt’s thread without touching it`, () => {
					const screw = asManifold(evaluateNode(M, bolt(size, head, 30), 'a')!);
					const turned = asManifold(evaluateNode(M, nut(size, fit), 'a')!).translate([0, 0, PITCH[size]! * 8]);
					expect(screw.intersect(turned).volume()).toBeLessThan(turned.volume() * 1e-4);
				});
			}
		}
	}

	it('a nut a half pitch out of step with the bolt’s thread would have to cut into it', () => {
		const screw = asManifold(evaluateNode(M, bolt(5, 1, 30), 'a')!);
		const stuck = asManifold(evaluateNode(M, nut(5, 2), 'a')!).translate([0, 0, 0.8 * 8 + 0.4]);
		expect(screw.intersect(stuck).volume()).toBeGreaterThan(stuck.volume() * 0.01);
	});

	it('a bolt’s head is wider than the nut’s hole, so it stops the bolt: the hex head does not pass through the hole', () => {
		const screw = asManifold(evaluateNode(M, bolt(5, 1, 30), 'a')!);
		const hole = asManifold(evaluateNode(M, threaded('threaded-hole', { size: 5 }, 40), 'a')!);
		expect(screw.intersect(hole).volume()).toBeGreaterThan(0); // the head (8 mm across flats) is wider than the 5.4 mm hole
	});
});

describe('the simple thread detail in the CSG engine', () => {
	it('works out a block with a long threaded hole from a plain cylinder: a small fraction of the triangles, about the same material', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 60 });
		d = addShape(d, 'threaded-hole', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { height: 60 });
		const [real, simple] = [d, withSimpleThreads(d)].map((x) => evaluateGroup(M, groupNodes(x, ['b', 'h'], { id: 'g' }).design, 'g')!) as [
			GroupMesh,
			GroupMesh,
		];
		expect(simple.indices.length).toBeLessThan(real.indices.length / 20);
		const [vReal, vSimple] = [asManifold(real).volume(), asManifold(simple).volume()];
		expect(Math.abs(vSimple - vReal) / vReal).toBeLessThan(0.01);
	});

	it('a bolt’s hex head is cut the same either way', () => {
		const d = addShape(createEmptyDesign('d'), 'bolt', [0, 0], { id: 'a' }).design;
		const head = (x: Design) =>
			asManifold(evaluateNode(M, x, 'a')!).intersect(M.Manifold.cube([20, 20, 3.5], true).translate([0, 0, 20 + 3.5 / 2]));
		expect(head(withSimpleThreads(d)).volume()).toBeCloseTo(head(d).volume(), 3);
	});
});
