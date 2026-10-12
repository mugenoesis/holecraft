import {
	addShape,
	createEmptyDesign,
	type Design,
	type EdgeTreatment,
	groupNodes,
	type MeshEdge,
	moveNodes,
	setNodeEuler,
	setShapeSize,
	sharpEdges,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
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

/** Two 20 mm boxes side by side, grouped: one 40 x 20 x 20 solid from x = -10 to 30. Its long top front edge is split by the join. */
function bar(): { d: Design; g: string } {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [20, 0], { id: 'b' }).design;
	return { d: groupNodes(d, ['a', 'b'], { id: 'g' }).design, g: 'g' };
}

/** The edges of what a group makes, as the Edge tool would offer them. */
const edgesOf = (d: Design, g: string): MeshEdge[] => sharpEdges(evaluateGroup(M, d, g)!);
const topFront = (edges: MeshEdge[]) =>
	edges.find((e) => e.points.length === 2 && e.points.every((p) => Math.abs(p[2] - 20) < 1e-6 && Math.abs(p[1] + 10) < 1e-6))!;

const treat = (edge: MeshEdge, kind: EdgeTreatment['kind'], size: number, id = 'e1'): EdgeTreatment => ({
	id,
	kind,
	size,
	points: edge.points,
	normals: edge.normals,
});
const withEdges = (d: Design, id: string, edges: EdgeTreatment[]): Design => ({
	...d,
	nodes: { ...d.nodes, [id]: { ...d.nodes[id]!, edges } },
});

describe('edge treatments on a group', () => {
	it('the joined bar offers its long edge whole (40 mm), not as two pieces', () => {
		const { d, g } = bar();
		const edge = topFront(edgesOf(d, g));
		expect(Math.abs(edge.points[1]![0] - edge.points[0]![0])).toBeCloseTo(40, 4);
	});

	it('a chamfer removes a triangular strip: s * s / 2 along the edge', () => {
		const { d, g } = bar();
		const before = volume(evaluateGroup(M, d, g)!);
		const after = evaluateGroup(M, withEdges(d, g, [treat(topFront(edgesOf(d, g)), 'chamfer', 2)]), g)!;
		expect(before - volume(after)).toBeCloseTo((2 * 2 * 40) / 2, 2);
		expect(after.skippedEdges ?? []).toEqual([]);
	});

	it('a round removes the corner outside a quarter circle: (1 - pi/4) * r * r along the edge', () => {
		const { d, g } = bar();
		const before = volume(evaluateGroup(M, d, g)!);
		const after = volume(evaluateGroup(M, withEdges(d, g, [treat(topFront(edgesOf(d, g)), 'round', 3)]), g)!);
		const expected = (1 - Math.PI / 4) * 9 * 40;
		expect(Math.abs(before - after - expected) / expected).toBeLessThan(0.02); // the round is a 64-sided approximation
	});

	it('the cut faces are new edges themselves: a chamfered edge leaves two gentler edges where it was', () => {
		const { d, g } = bar();
		const cut = withEdges(d, g, [treat(topFront(edgesOf(d, g)), 'chamfer', 2)]);
		const edges = edgesOf(cut, g);
		expect(topFront(edges)).toBeUndefined();
		expect(edges.length).toBeGreaterThan(12);
	});

	it('chamfers several edges, and a whole curved rim', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'cylinder', [0, 0], { id: 'c' }).design;
		d = addShape(d, 'box', [100, 0], { id: 'far' }).design;
		const { design, id } = groupNodes(d, ['c', 'far'], { id: 'g' });
		const rim = edgesOf(design, id!).find((e) => e.closed && e.points.every((p) => Math.abs(p[2] - 20) < 1e-6))!;
		expect(rim).toBeDefined();
		const plain = volume(evaluateGroup(M, design, id!)!);
		const cut = volume(evaluateGroup(M, withEdges(design, id!, [treat(rim, 'chamfer', 2)]), id!)!);
		// The same bevel as a Stage A top chamfer on that cylinder: a frustum on top instead of the full 2 mm.
		const N = 64;
		const area = (r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
		const removed = area(10) * 2 - (2 / 3) * (area(8) + area(10) + Math.sqrt(area(8) * area(10)));
		expect(Math.abs(plain - cut - removed) / removed).toBeLessThan(0.02);
	});

	it('skips (and reports) a treatment whose edge an edit has removed, instead of cutting the wrong place', () => {
		const { d, g } = bar();
		const t = treat(topFront(edgesOf(d, g)), 'chamfer', 2);
		// make the bar taller: the stored edge (at z = 20) is no longer an edge
		const taller = setShapeSize(setShapeSize(d, 'a', { height: 30 }), 'b', { height: 30 });
		const plain = volume(evaluateGroup(M, taller, g)!);
		const result = evaluateGroup(M, withEdges(taller, g, [t]), g)!;
		expect(volume(result)).toBeCloseTo(plain, 3);
		expect(result.skippedEdges).toEqual(['e1']);
	});

	it('keeps working when the group is moved or turned (the edge is stored in the group’s own frame)', () => {
		const { d, g } = bar();
		const treated = withEdges(d, g, [treat(topFront(edgesOf(d, g)), 'chamfer', 2)]);
		const inPlace = volume(evaluateGroup(M, treated, g)!);
		const moved = setNodeEuler(moveNodes(treated, [g], [50, 30, 5]), g, [0, 0, 90]);
		expect(volume(evaluateGroup(M, moved, g)!)).toBeCloseTo(inPlace, 3);
		expect(volume(evaluateNode(M, moved, g)!)).toBeCloseTo(inPlace, 3); // exported, placed in the world
	});

	it('changes the cache key, so a treated group is never shown with an old result', () => {
		const { d, g } = bar();
		const treated = withEdges(d, g, [treat(topFront(edgesOf(d, g)), 'chamfer', 2)]);
		expect(subtreeHash(treated, g)).not.toBe(subtreeHash(d, g));
		expect(subtreeHash(withEdges(d, g, [treat(topFront(edgesOf(d, g)), 'chamfer', 3)]), g)).not.toBe(subtreeHash(treated, g));
	});
});

describe('edge treatments on a shape', () => {
	it('evaluated on its own, a loose shape comes out in its own frame (not placed), with its edges cut', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		const plain = volume(evaluateNode(M, d, 'a')!);
		const edge: EdgeTreatment = {
			id: 'e1',
			kind: 'chamfer',
			size: 2,
			points: [
				[-10, -10, 20],
				[10, -10, 20],
			],
			normals: [
				[
					[0, 0, 1],
					[0, -1, 0],
				],
			],
		};
		const moved = moveNodes(withEdges(d, 'a', [edge]), ['a'], [30, 0, 0]);
		const own = evaluateGroup(M, moved, 'a')!;
		expect(plain - volume(own)).toBeCloseTo(40, 1);
		const xs = Array.from(own.positions).filter((_, i) => i % 3 === 0);
		expect(Math.min(...xs)).toBeCloseTo(-10); // not moved by the shape's transform
	});

	it('a loose box can have its own edges treated, in its own frame', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		const plain = volume(evaluateNode(M, d, 'a')!);
		// the box's own top front edge: from its own top (+z) and front (-y)
		const edge: EdgeTreatment = {
			id: 'e1',
			kind: 'chamfer',
			size: 2,
			points: [
				[-10, -10, 20],
				[10, -10, 20],
			],
			normals: [
				[
					[0, 0, 1],
					[0, -1, 0],
				],
			],
		};
		const moved = moveNodes(withEdges(d, 'a', [edge]), ['a'], [30, 0, 0]);
		expect(plain - volume(evaluateNode(M, moved, 'a')!)).toBeCloseTo(40, 1);
	});
});
