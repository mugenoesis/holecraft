import {
	addShape,
	createEmptyDesign,
	type Design,
	groupGeometry,
	groupNodes,
	type ShapeNode,
	setEdgeTreatments,
	setGroupGeometry,
	setNodeMode,
	setShapeParam,
	setShapeSize,
	treatEdges,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
import { loadManifold } from './load.ts';
import { subtreeHash } from './subtree.ts';
import { toolEdges } from './toolEdges.ts';
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

const N = 64;
/** Area of an N-sided polygon inscribed in an ellipse with semi-axes a and b. */
const area = (a: number, b: number) => (N / 2) * a * b * Math.sin((2 * Math.PI) / N);

function one(type: 'tube' | 'torus', size: [number, number, number], settings: Record<string, number> = {}): Design {
	let d = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	d = setShapeSize(d, 'a', { width: size[0], depth: size[1], height: size[2] });
	for (const [key, value] of Object.entries(settings)) d = setShapeParam(d, 'a', key, value);
	return d;
}

describe('the tube in the CSG engine', () => {
	it('has the volume of the outer ellipse minus the same ellipse shrunk by the wall (3 mm of the 10 mm narrower radius is 30%)', () => {
		const mesh = evaluateNode(M, one('tube', [20, 30, 12], { wall: 3 }), 'a')!;
		expect(volume(mesh)).toBeCloseTo((area(10, 15) - area(7, 10.5)) * 12, 2);
	});

	it('stretches evenly when it is made bigger: the wall and the hole grow with it', () => {
		const small = one('tube', [20, 20, 20], { wall: 2 }); // 2 mm of the 10 mm radius: 20%
		expect(volume(evaluateNode(M, small, 'a')!)).toBeCloseTo((area(10, 10) - area(8, 8)) * 20, 2);
		const big = setShapeSize(small, 'a', { width: 40, depth: 40 });
		expect(volume(evaluateNode(M, big, 'a')!)).toBeCloseTo((area(20, 20) - area(16, 16)) * 20, 2); // the wall is 4 mm now
		const stretched = setShapeSize(small, 'a', { width: 40 });
		expect(volume(evaluateNode(M, stretched, 'a')!)).toBeCloseTo((area(20, 10) - area(16, 8)) * 20, 2); // an oval tube with an oval hole
	});

	it('is limited rather than refused when the wall is too thick for the shape', () => {
		const mesh = evaluateNode(M, one('tube', [20, 20, 20], { wall: 50 }), 'a')!;
		expect(volume(mesh)).toBeGreaterThan(0);
		expect(volume(mesh)).toBeLessThan(area(10, 10) * 20);
	});

	it('is a hole when set to Hole: cutting a ring out of a block leaves the middle standing', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 20 });
		d = addShape(d, 'tube', [0, 0], { id: 't' }).design;
		d = setShapeSize(d, 't', { width: 30, depth: 30, height: 40 });
		d = setShapeParam(d, 't', 'wall', 4);
		d = setNodeMode(d, ['t'], 'hole');
		d = groupNodes(d, ['b', 't'], { id: 'g' }).design;
		const cutOut = (area(15, 15) - area(11, 11)) * 20; // the ring, 20 mm of its 40 mm height inside the block
		expect(40 * 40 * 20 - volume(evaluateGroup(M, d, 'g')!)).toBeCloseTo(cutOut, 1);
	});

	it('changes the cache key when the wall changes, so a group with a tube in it is never shown with an old result', () => {
		const d = (wall: number) => {
			let x = addShape(createEmptyDesign('d'), 'tube', [0, 0], { id: 'a' }).design;
			x = setShapeParam(x, 'a', 'wall', wall);
			x = addShape(x, 'box', [40, 0], { id: 'b' }).design;
			return groupNodes(x, ['a', 'b'], { id: 'g' }).design;
		};
		expect(subtreeHash(d(3), 'g')).not.toBe(subtreeHash(d(4), 'g'));
		expect(subtreeHash(d(4), 'g')).toBe(subtreeHash(d(4), 'g'));
	});

	it('offers its four rims to the Edge tool (top and bottom, outside and in)', () => {
		const rims = toolEdges(M, one('tube', [20, 20, 20], { wall: 3 }), 'a').filter((e) => e.closed);
		expect(rims).toHaveLength(4);
	});

	it('stretches evenly with a group it is in: the wall and hole grow with the group', () => {
		let d = addShape(createEmptyDesign('d'), 'tube', [0, 0], { id: 't' }).design;
		d = setShapeParam(d, 't', 'wall', 2);
		d = addShape(d, 'box', [0, 0], { id: 'b' }).design; // the same footprint, so the group is as wide as the tube
		d = groupNodes(d, ['t', 'b'], { id: 'g' }).design;
		const g = groupGeometry(d, 'g')!;
		const resized = setGroupGeometry(d, 'g', { ...g, width: 40, depth: 40 });
		const t = resized.nodes.t as ShapeNode;
		expect(t.params.width).toBeCloseTo(40, 6);
		expect(t.params.wall).toBeCloseTo(0.2, 9); // still 20% of the radius
		expect(volume(evaluateNode(M, resized, 't')!)).toBeCloseTo((area(20, 20) - area(16, 16)) * 20, 1);
	});

	it('keeps its chamfers on their edges when it is resized (nothing breaks once it is made)', () => {
		const plain = one('tube', [20, 20, 20], { wall: 3 });
		const rims = toolEdges(M, plain, 'a').filter((e) => e.closed && e.points.every((p) => Math.abs(p[2] - 20) < 1e-6));
		expect(rims).toHaveLength(2); // the outer and inner rim of the top
		let n = 0;
		const treated = setEdgeTreatments(
			plain,
			'a',
			treatEdges([], rims, [0, 1], 'chamfer', 1, () => `t${++n}`),
		);
		const resized = setShapeSize(treated, 'a', { width: 40, depth: 30, height: 12 });
		expect(evaluateNode(M, resized, 'a')!.skippedEdges ?? []).toEqual([]);
		// the same chamfers made on the already-resized tube remove the same material
		const direct = setShapeSize(plain, 'a', { width: 40, depth: 30, height: 12 });
		const rims2 = toolEdges(M, direct, 'a').filter((e) => e.closed && e.points.every((p) => Math.abs(p[2] - 12) < 1e-6));
		const chamfered = setEdgeTreatments(
			direct,
			'a',
			treatEdges([], rims2, [0, 1], 'chamfer', 1, () => `u${++n}`),
		);
		const [got, wanted] = [volume(evaluateNode(M, resized, 'a')!), volume(evaluateNode(M, chamfered, 'a')!)];
		expect(Math.abs(got - wanted) / wanted).toBeLessThan(0.005);
	});
});

describe('the torus in the CSG engine', () => {
	it('is a ring, the volume of its tube swept round (2 * pi^2 * R * r^2), a little under for the facets', () => {
		const mesh = evaluateNode(M, one('torus', [30, 30, 10], { thickness: 10 }), 'a')!;
		const exact = 2 * Math.PI ** 2 * 10 * 5 ** 2;
		expect(volume(mesh)).toBeLessThan(exact);
		expect((exact - volume(mesh)) / exact).toBeLessThan(0.02);
	});

	it('is built in its own frame and placed by its transform, like any shape', () => {
		let d = one('torus', [30, 30, 10]);
		d = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 7, 1] } } };
		const mesh = evaluateNode(M, d, 'a')!;
		const at = (k: number) => Array.from(mesh.positions).filter((_, i) => i % 3 === k);
		expect([Math.min(...at(0)), Math.max(...at(0))].map(Math.round)).toEqual([35, 65]);
		expect([Math.min(...at(2)), Math.max(...at(2))].map(Math.round)).toEqual([7, 17]);
	});

	it('cuts a ring-shaped groove when it is a hole in a block', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 10 });
		d = addShape(d, 'torus', [0, 0], { id: 't' }).design;
		d = setNodeMode(d, ['t'], 'hole');
		d = groupNodes(d, ['b', 't'], { id: 'g' }).design;
		const groove = 16000 - volume(evaluateGroup(M, d, 'g')!);
		expect(groove).toBeGreaterThan(4000); // most of the ring (about 4,900 mm3) is inside the block
		expect(groove).toBeLessThan(5000);
	});
});
