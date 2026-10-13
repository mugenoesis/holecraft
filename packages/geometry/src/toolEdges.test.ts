import {
	addShape,
	countSegments,
	createEmptyDesign,
	type Design,
	type EdgeTreatment,
	edgeLength,
	groupNodes,
	MAX_OFFERED_SEGMENTS,
	MIN_EDGE_LENGTH,
	moveNodes,
	setEdgeTreatments,
	setNodeMode,
	setShapeCountersink,
	setShapeSize,
	treatEdges,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadManifold } from './load.ts';
import { toolEdges, toolEdgesKey } from './toolEdges.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

/** The top front edge of a 20 mm box at the origin, in its own frame. */
const TOP_FRONT: EdgeTreatment = {
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
const withEdges = (d: Design, id: string, edges: EdgeTreatment[]): Design => ({
	...d,
	nodes: { ...d.nodes, [id]: { ...d.nodes[id]!, edges } },
});
const box = () => addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;

describe('the edges the Edge tool offers', () => {
	it('a box offers its 12 edges, in its own frame', () => {
		const edges = toolEdges(M, moveNodes(box(), ['a'], [30, 0, 0]), 'a');
		expect(edges).toHaveLength(12);
		const xs = edges.flatMap((e) => e.points.map((p) => p[0]));
		expect(Math.min(...xs)).toBeCloseTo(-10); // not moved by the shape's transform
	});

	it('are worked out without the node’s own treatments, so a chamfered edge is still offered (to change or remove it)', () => {
		expect(toolEdges(M, withEdges(box(), 'a', [TOP_FRONT]), 'a')).toHaveLength(12);
	});

	it('a group offers the edges of what it makes, joined pieces as one solid', () => {
		let d = box();
		d = addShape(d, 'box', [20, 0], { id: 'b' }).design;
		const { design } = groupNodes(d, ['a', 'b'], { id: 'g' });
		expect(toolEdges(M, design, 'g')).toHaveLength(12); // one 40 x 20 x 20 bar
	});

	it('a sphere has none', () => {
		expect(toolEdges(M, addShape(createEmptyDesign('d'), 'sphere', [0, 0], { id: 's' }).design, 's')).toEqual([]);
	});

	it('the key ignores the node’s own treatments (previewing a chamfer doesn’t ask again) but not its shape', () => {
		const d = box();
		expect(toolEdgesKey(withEdges(d, 'a', [TOP_FRONT]), 'a')).toBe(toolEdgesKey(d, 'a'));
		expect(toolEdgesKey(setShapeSize(d, 'a', { height: 30 }), 'a')).not.toBe(toolEdgesKey(d, 'a'));
	});
});

describe('a shape already cut up by many treatments', () => {
	/** An L-shaped block with a countersunk hole, every outer edge chamfered, then grouped with another block. */
	function treatedThenWrapped(): Design {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'box', [20, 20], { id: 'b' }).design;
		d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { width: 6, depth: 6, height: 20 });
		d = setNodeMode(d, ['h'], 'hole');
		d = setShapeCountersink(d, 'h', { size: 3 });
		d = groupNodes(d, ['a', 'b', 'h'], { id: 'g' }).design;
		const found = toolEdges(M, d, 'g');
		let n = 0;
		d = setEdgeTreatments(
			d,
			'g',
			treatEdges(
				[],
				found,
				found.map((_, i) => i),
				'chamfer',
				2,
				() => `t${++n}`,
			),
		);
		d = addShape(d, 'box', [80, 0], { id: 'c' }).design;
		return groupNodes(d, ['g', 'c'], { id: 'outer' }).design;
	}

	it('offers only edges you could choose: none shorter than half a millimetre, however many steps the cuts left', () => {
		const edges = toolEdges(M, treatedThenWrapped(), 'outer');
		expect(edges.length).toBeGreaterThan(0);
		expect(edges.every((e) => edgeLength(e) >= MIN_EDGE_LENGTH)).toBe(true);
	});

	it('leaves few enough pieces to draw (the unfiltered shape has thousands of tiny ones)', () => {
		expect(countSegments(toolEdges(M, treatedThenWrapped(), 'outer'))).toBeLessThan(MAX_OFFERED_SEGMENTS);
	});
});

describe('the edges of the finished shape', () => {
	it('include its own chamfers and rounds when asked (the ruler snaps to what is there), which the Edge tool leaves out', () => {
		const d = withEdges(box(), 'a', [TOP_FRONT]);
		const [offered, finished] = [toolEdges(M, d, 'a'), toolEdges(M, d, 'a', undefined, { treated: true })];
		expect(offered).toHaveLength(12); // a box's twelve edges, the chamfered one still offered whole
		expect(finished.length).toBeGreaterThan(offered.length); // the chamfer's two edges instead of the one it replaced
		expect(finished.some((e) => e.points.some((p) => Math.abs(p[2]! - 18) < 1e-6))).toBe(true); // an edge 2 mm below the top: where the chamfer ends
	});

	it('are asked for with a different key, so the two answers are never mixed up', () => {
		const d = withEdges(box(), 'a', [TOP_FRONT]);
		expect(toolEdgesKey(d, 'a', { treated: true })).not.toBe(toolEdgesKey(d, 'a'));
		expect(toolEdgesKey(box(), 'a', { treated: true })).toBe(toolEdgesKey(box(), 'a', { treated: true }));
	});
});
