import {
	addShape,
	createEmptyDesign,
	type Design,
	groupNodes,
	moveNodes,
	renameNode,
	setNodeColor,
	setNodeEuler,
	setNodeMode,
	setShapeSize,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectBodies, evaluateNode } from './export.ts';
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
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
}

function bounds(mesh: GroupMesh) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < mesh.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
			max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
		}
	}
	return { min, max };
}

const near = (actual: number, expected: number, fraction = 0.01) =>
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * fraction);
const close = (a: readonly number[], b: readonly number[], digits = 4) => b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, digits));

function twoShapes(): Design {
	let d = createEmptyDesign('d', 'Test');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [100, 0], { id: 'b' }).design;
	return d;
}

describe('evaluateNode', () => {
	it('builds a loose shape, placed in the world', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [30, 40], { id: 'a' }).design;
		d = moveNodes(d, ['a'], [0, 0, 5]);
		const mesh = evaluateNode(M, d, 'a')!;
		near(volume(mesh), 8000);
		expect(bounds(mesh)).toEqual({ min: [20, 30, 5], max: [40, 50, 25] });
	});

	it('applies rotation', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = setShapeSize(d, 'a', { width: 40, depth: 10, height: 10 });
		d = setNodeEuler(d, 'a', [0, 0, 90]);
		const b = bounds(evaluateNode(M, d, 'a')!);
		close(b.min, [-5, -20, 0]);
		close(b.max, [5, 20, 10]);
	});

	it('builds a group with its holes cut and its own transform applied', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { width: 10, depth: 10, height: 40 });
		d = setNodeMode(d, ['h'], 'hole');
		d = groupNodes(d, ['a', 'h'], { id: 'g' }).design;
		d = moveNodes(d, ['g'], [100, 0, 0]);
		const mesh = evaluateNode(M, d, 'g')!;
		near(volume(mesh), 8000 - 0.5 * 64 * 25 * Math.sin((2 * Math.PI) / 64) * 20);
		expect(bounds(mesh)).toEqual({ min: [90, -10, 0], max: [110, 10, 20] });
	});

	it('returns null for things with nothing to build', () => {
		const d = twoShapes();
		expect(evaluateNode(M, d, 'nope')).toBeNull();
		const consumed = setNodeMode(groupNodes(d, ['a', 'b'], { id: 'g' }).design, ['a', 'b'], 'hole');
		expect(evaluateNode(M, consumed, 'g')).toBeNull();
	});
});

describe('collectBodies', () => {
	it('is empty for an empty design', () => {
		expect(collectBodies(M, createEmptyDesign('d'))).toEqual([]);
	});

	it('gives one body per top-level solid, in order, with its name and colour', () => {
		let d = twoShapes();
		d = renameNode(d, 'a', 'Base');
		d = setNodeColor(d, ['b'], '#336699');
		const bodies = collectBodies(M, d);
		expect(bodies.map((b) => b.name)).toEqual(['Base', 'Sphere 1']);
		expect(bodies[1]!.color).toBe('#336699');
		near(volume(bodies[0]!.mesh), 8000);
	});

	it('leaves out holes, hidden shapes and hole groups', () => {
		let d = twoShapes();
		d = addShape(d, 'cylinder', [0, 100], { id: 'hole' }).design;
		d = addShape(d, 'box', [0, 200], { id: 'hidden' }).design;
		d = setNodeMode(d, ['hole'], 'hole');
		d.nodes.hidden!.hidden = true;
		expect(collectBodies(M, d).map((b) => b.name)).toEqual(['Box 1', 'Sphere 1']);
	});

	it('leaves out a hole group and a group that is fully cut away', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'box', [0, 0], { id: 'b' }).design;
		d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		d = setNodeMode(d, ['g'], 'hole');
		expect(collectBodies(M, d)).toEqual([]);
	});

	it('takes a group as one body, named after the group', () => {
		let d = twoShapes();
		d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		d = renameNode(d, 'g', 'Pair');
		const bodies = collectBodies(M, d);
		expect(bodies.map((b) => b.name)).toEqual(['Pair']);
		near(volume(bodies[0]!.mesh), 8000 + (Math.PI / 6) * 20 ** 3, 0.03);
	});

	it('puts every body where it is in the design', () => {
		const d = moveNodes(twoShapes(), ['b'], [0, 0, 7]);
		const [, sphere] = collectBodies(M, d);
		close(bounds(sphere!.mesh).min, [90, -10, 7], 1);
	});

	it('does not change the design', () => {
		const d = twoShapes();
		const before = JSON.stringify(d);
		collectBodies(M, d);
		expect(JSON.stringify(d)).toBe(before);
	});
});
