import {
	addPaint,
	addShape,
	createEmptyDesign,
	type Design,
	groupNodes,
	type PaintFill,
	setNodeEuler,
	setNodeMode,
	setShapeSize,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
import { collectBodies } from './export.ts';
import { loadManifold } from './load.ts';
import { rootComputedNodes, subtreeHash } from './subtree.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

const RED = '#ff0000';
const BLUE = '#0000ff';
const topFill = (color = RED, id = 'p'): PaintFill => ({ id, kind: 'region', color, point: [0, 0, 20], normal: [0, 0, 1] });

/** Area and area-weighted outward direction of the triangles given the number `which` in the mesh's paint. */
function painted(mesh: GroupMesh, which: number) {
	const tri = mesh.paint!.triangle;
	let area = 0;
	const sum = [0, 0, 0];
	for (let t = 0; t < tri.length; t++) {
		if (tri[t] !== which) continue;
		const c = [0, 1, 2].map((k) => [0, 1, 2].map((a) => mesh.positions[mesh.indices[t * 3 + k]! * 3 + a]!));
		const u = [0, 1, 2].map((a) => c[1]![a]! - c[0]![a]!);
		const v = [0, 1, 2].map((a) => c[2]![a]! - c[0]![a]!);
		const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
		area += Math.hypot(n[0]!, n[1]!, n[2]!) / 2;
		for (let a = 0; a < 3; a++) sum[a]! += n[a]! / 2;
	}
	return { area, direction: sum.map((v) => v / (area || 1)) };
}
const box = (extra?: (d: Design) => Design): Design => {
	const d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design; // 20 x 20 x 20, base centre at the origin
	return extra ? extra(d) : d;
};

describe('painted shapes in the CSG engine', () => {
	it('leave a mesh with no paint field when nothing is painted (or the paint touches nothing)', () => {
		expect(evaluateGroup(M, box(), 'a')!.paint).toBeUndefined();
		const away = addPaint(box(), 'a', { id: 'p', kind: 'region', color: RED, point: [0, 0, 90], normal: [0, 0, 1] });
		expect(evaluateGroup(M, away, 'a')!.paint).toBeUndefined();
	});

	it('say which triangles are painted: the top of a 20 mm box is 400 mm2 in one colour and the rest is not painted', () => {
		const mesh = evaluateGroup(M, addPaint(box(), 'a', topFill()), 'a')!;
		expect(mesh.paint!.colors).toEqual([RED]);
		expect(mesh.paint!.triangle).toHaveLength(mesh.indices.length / 3);
		expect(painted(mesh, 1).area).toBeCloseTo(400, 3);
		expect(painted(mesh, 1).direction).toEqual([0, 0, 1].map((v) => expect.closeTo(v, 6)));
		expect(painted(mesh, 0).area).toBeCloseTo(2000, 3);
	});

	it('are painted on the finished surface: a hole cut through the top takes its wall and its area out of the top', () => {
		let d = addShape(box(), 'cylinder', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { width: 10, depth: 10, height: 40 });
		d = setNodeMode(d, ['h'], 'hole');
		d = groupNodes(d, ['a', 'h'], { id: 'g' }).design;
		const g = addPaint(d, 'g', { ...topFill(), point: [8, 0, 20] } as PaintFill);
		const mesh = evaluateGroup(M, g, 'g')!;
		const polygon = 64 * 0.5 * 25 * Math.sin((2 * Math.PI) / 64); // the 64-sided hole's area, from its radius 5 mm
		expect(painted(mesh, 1).area).toBeCloseTo(400 - polygon, 1);
	});

	it('are exported where they stand: turned a quarter about X, the painted face is the one facing -Y, still 400 mm2', () => {
		const turned = setNodeEuler(addPaint(box(), 'a', topFill()), 'a', [90, 0, 0]);
		const placed = evaluateNode(M, turned, 'a')!;
		expect(painted(placed, 1).area).toBeCloseTo(400, 2);
		const [x, y, z] = painted(placed, 1).direction;
		expect([x, y, z]).toEqual([expect.closeTo(0, 5), expect.closeTo(-1, 5), expect.closeTo(0, 5)]);
		// the same paint, evaluated in the shape's own frame, is the same triangles' areas
		expect(painted(evaluateGroup(M, turned, 'a')!, 1).area).toBeCloseTo(400, 3);
	});

	it('are on the export bodies, and a body with no paint has none', () => {
		let d = addShape(addPaint(box(), 'a', topFill(BLUE)), 'cylinder', [60, 0], { id: 'c' }).design;
		d = addPaint(d, 'c', { id: 'w', kind: 'body', color: RED });
		const bodies = collectBodies(M, d);
		expect(bodies[0]!.mesh.paint!.colors).toEqual([BLUE]);
		expect(bodies[1]!.mesh.paint!.colors).toEqual([RED]);
		expect(collectBodies(M, box())[0]!.mesh.paint).toBeUndefined();
	});

	it('ignore paint on a hole, and on a shape that is part of a group (only what is printed as one body is painted)', () => {
		const holePaint = setNodeMode(addPaint(box(), 'a', topFill()), ['a'], 'hole');
		expect(evaluateGroup(M, holePaint, 'a')!.paint).toBeUndefined();
		const inGroup = groupNodes(addShape(addPaint(box(), 'a', topFill()), 'cylinder', [60, 0], { id: 'c' }).design, ['a', 'c'], {
			id: 'g',
		}).design;
		expect(evaluateGroup(M, inGroup, 'g')!.paint).toBeUndefined();
	});

	it('make a loose shape a computed node (so the view draws its paint), and are part of the cache key', () => {
		expect(rootComputedNodes(box())).toEqual([]);
		const d = addPaint(box(), 'a', topFill());
		expect(rootComputedNodes(d)).toEqual(['a']);
		expect(subtreeHash(d, 'a')).not.toBe(subtreeHash(box(), 'a'));
		expect(subtreeHash(d, 'a')).not.toBe(subtreeHash(addPaint(box(), 'a', topFill(BLUE)), 'a'));
		expect(subtreeHash(d, 'a')).toBe(subtreeHash(addPaint(box(), 'a', topFill(RED, 'other-id')), 'a')); // ids are not geometry
	});
});
