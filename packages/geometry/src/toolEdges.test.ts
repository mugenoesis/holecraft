import { addShape, createEmptyDesign, type Design, type EdgeTreatment, groupNodes, moveNodes, setShapeSize } from '@holecraft/core';
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
