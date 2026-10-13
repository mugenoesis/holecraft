import { addShape, createEmptyDesign, type Design, groupNodes, setNodeMode, setShapeParam, setShapeSize } from '@holecraft/core';
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

const deg = (d: number) => (d * Math.PI) / 180;
/** Hand-worked, as in core: ten triangles from the middle, stretched to fill the box. */
const starVolume = (r: number, w: number, d: number, h: number) =>
	5 * r * Math.sin(deg(36)) * (w / (2 * Math.sin(deg(72)))) * (d / (1 + Math.cos(deg(36)))) * h;

function one(type: 'hexagon' | 'star', size: [number, number, number]): Design {
	const d = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	return setShapeSize(d, 'a', { width: size[0], depth: size[1], height: size[2] });
}

describe('the hexagon in the CSG engine', () => {
	it('has the volume of its outline: a middle band 1/2 the width plus two end triangles, 3/4 of the box', () => {
		expect(volume(evaluateNode(M, one('hexagon', [20, 30, 12]), 'a')!)).toBeCloseTo(0.75 * 20 * 30 * 12, 3);
	});

	it('cuts a six-sided hole from a block (a nut’s pocket): the block loses exactly the hexagon', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 10 });
		d = addShape(d, 'hexagon', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { width: 20, depth: 17.32, height: 10 });
		d = setNodeMode(d, ['h'], 'hole');
		const g = groupNodes(d, ['b', 'h'], { id: 'g' });
		expect(volume(evaluateGroup(M, g.design, 'g')!)).toBeCloseTo(40 * 40 * 10 - 0.75 * 20 * 17.32 * 10, 2);
	});
});

describe('the star in the CSG engine', () => {
	it('has the volume worked out by hand, and a typed inner radius changes it', () => {
		let d = one('star', [20, 19.02, 10]);
		expect(volume(evaluateNode(M, d, 'a')!)).toBeCloseTo(starVolume(0.4, 20, 19.02, 10), 2);
		d = setShapeParam(d, 'a', 'inner', 6); // 6 mm of the 10 mm half-width
		expect(volume(evaluateNode(M, d, 'a')!)).toBeCloseTo(starVolume(0.6, 20, 19.02, 10), 2);
	});

	it('stretches evenly when made bigger: the inner radius grows with it', () => {
		const d = setShapeSize(one('star', [20, 19.02, 10]), 'a', { width: 40, depth: 38.04, height: 10 });
		expect(volume(evaluateNode(M, d, 'a')!)).toBeCloseTo(starVolume(0.4, 40, 38.04, 10), 1);
	});

	it('is a hole when set to Hole: a star-shaped cut in a block', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 10 });
		d = addShape(d, 'star', [0, 0], { id: 's' }).design;
		d = setNodeMode(d, ['s'], 'hole');
		const g = groupNodes(d, ['b', 's'], { id: 'g' });
		expect(volume(evaluateGroup(M, g.design, 'g')!)).toBeCloseTo(40 * 40 * 10 - starVolume(0.4, 20, 19.02, 10), 2);
	});
});
