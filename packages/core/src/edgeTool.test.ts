import { describe, expect, it } from 'vitest';
import type { EdgeTreatment } from './design.ts';
import { createEmptyDesign } from './design.ts';
import type { MeshEdge } from './edges.ts';
import {
	clearEdges,
	countSegments,
	defaultEdgeSize,
	edgeLength,
	edgeToolTarget,
	MIN_EDGE_LENGTH,
	nearestEdge,
	nextChosen,
	treatEdges,
	treatedEdges,
	usefulEdges,
} from './edgeTool.ts';
import { setNodeMode } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape } from './ops.ts';
import { setLocked } from './visibility.ts';

/** Two edges of a 20 mm box at the origin: the top front and the top back. */
const FRONT: MeshEdge = {
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
	closed: false,
};
const BACK: MeshEdge = {
	points: [
		[-10, 10, 20],
		[10, 10, 20],
	],
	normals: [
		[
			[0, 0, 1],
			[0, 1, 0],
		],
	],
	closed: false,
};
const found = [FRONT, BACK];
const on = (edge: MeshEdge, id: string, size = 2, kind: EdgeTreatment['kind'] = 'chamfer'): EdgeTreatment => ({
	id,
	kind,
	size,
	points: edge.points,
	normals: edge.normals,
});
let n = 0;
const makeId = () => `new${++n}`;

describe('which edges already have a treatment', () => {
	it('finds each treatment’s edge among those offered', () => {
		expect([...treatedEdges(found, [on(BACK, 't1')])]).toEqual([1]);
		expect(treatedEdges(found, [])).toEqual(new Set());
	});
});

describe('treating the chosen edges', () => {
	it('adds one treatment per chosen edge, carrying the edge as it was found', () => {
		const edges = treatEdges([], found, [0, 1], 'round', 3, makeId);
		expect(edges).toHaveLength(2);
		expect(edges[0]).toMatchObject({ kind: 'round', size: 3, points: FRONT.points, normals: FRONT.normals });
		expect(new Set(edges.map((e) => e.id)).size).toBe(2);
	});

	it('replaces the treatment already on a chosen edge (never two cuts on one edge) and keeps the others', () => {
		const edges = treatEdges([on(FRONT, 'old'), on(BACK, 'keep')], found, [0], 'round', 4, makeId);
		expect(edges.map((e) => e.id)).not.toContain('old');
		expect(edges.find((e) => e.id === 'keep')).toEqual(on(BACK, 'keep'));
		expect(edges.find((e) => e.points === FRONT.points)).toMatchObject({ kind: 'round', size: 4 });
	});

	it('keeps treatments the tool can’t see (their edge is gone), so nothing is lost silently', () => {
		const gone = { ...on(FRONT, 'gone'), points: FRONT.points.map((p) => [p[0], p[1], 50]) as MeshEdge['points'] };
		expect(treatEdges([gone], found, [0], 'chamfer', 1, makeId).map((e) => e.id)).toContain('gone');
	});

	it('clearing removes only the treatments on the chosen edges', () => {
		expect(clearEdges([on(FRONT, 'a'), on(BACK, 'b')], found, [1]).map((e) => e.id)).toEqual(['a']);
	});
});

describe('choosing edges with clicks', () => {
	it('a click chooses just that edge; Shift adds it, or takes it out again', () => {
		expect(nextChosen([0, 2], 1, false)).toEqual([1]);
		expect(nextChosen([0], 1, true)).toEqual([0, 1]);
		expect(nextChosen([0, 1], 0, true)).toEqual([1]);
	});
});

describe('the default size', () => {
	it('is about 5% of the part’s smallest side, on the grid', () => {
		expect(defaultEdgeSize([20, 20, 20], 1)).toBe(1);
		expect(defaultEdgeSize([100, 80, 60], 1)).toBe(3);
		expect(defaultEdgeSize([100, 100, 100], 2)).toBe(6); // 5 rounds to the 2 mm grid
	});

	it('uses tenths of a millimetre when the grid is too coarse for the part, or off, and is never zero', () => {
		expect(defaultEdgeSize([20, 20, 20], 10)).toBe(1);
		expect(defaultEdgeSize([4, 40, 40], 1)).toBe(0.2);
		expect(defaultEdgeSize([20, 20, 20], 0)).toBe(1);
		expect(defaultEdgeSize([0.5, 0.5, 0.5], 1)).toBe(0.1);
	});
});

describe('picking an edge on screen', () => {
	const segments = [
		{ edge: 0, a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
		{ edge: 1, a: { x: 0, y: 20 }, b: { x: 100, y: 20 } },
	];

	it('gives the edge nearest the pointer, within reach', () => {
		expect(nearestEdge(segments, 50, 4)).toBe(0);
		expect(nearestEdge(segments, 50, 14)).toBe(1);
		expect(nearestEdge(segments, 104, 2)).toBe(0); // just past the end still counts
	});

	it('gives nothing when every edge is out of reach', () => {
		expect(nearestEdge(segments, 50, 60)).toBeNull();
		expect(nearestEdge([], 0, 0)).toBeNull();
	});
});

describe('what the tool works on', () => {
	const design = () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'box', [40, 0], { id: 'b' }).design;
		return d;
	};

	it('one solid shape or group', () => {
		expect(edgeToolTarget(design(), ['a'])).toEqual({ id: 'a' });
		const { design: grouped, id } = groupNodes(design(), ['a', 'b'], { id: 'g' });
		expect(edgeToolTarget(grouped, [id!])).toEqual({ id: 'g' });
	});

	it('explains why not otherwise', () => {
		expect(edgeToolTarget(design(), [])).toEqual({ problem: 'Select a shape or group to chamfer or round its edges' });
		expect(edgeToolTarget(design(), ['a', 'b'])).toEqual({ problem: 'Select just one shape or group' });
		expect(edgeToolTarget(setNodeMode(design(), ['a'], 'hole'), ['a'])).toEqual({
			problem: 'Holes have no edges to treat; select a solid',
		});
		expect(edgeToolTarget(setLocked(design(), ['a'], true), ['a'])).toEqual({ problem: 'Box 1 is locked' });
	});

	it('refuses a thread on its own (its helix is thousands of tiny edges), but not a washer or a group holding one', () => {
		const rod = addShape(createEmptyDesign('d'), 'threaded-rod', [0, 0], { id: 't' }).design;
		expect(edgeToolTarget(rod, ['t'])).toEqual({ problem: expect.stringContaining('Threads') });
		const washer = addShape(createEmptyDesign('d'), 'washer', [0, 0], { id: 'w' }).design;
		expect(edgeToolTarget(washer, ['w'])).toEqual({ id: 'w' });
		const { design: grouped } = groupNodes(addShape(rod, 'box', [0, 0], { id: 'b' }).design, ['t', 'b'], { id: 'g' });
		expect(edgeToolTarget(grouped, ['g'])).toEqual({ id: 'g' });
	});
});

describe('which edges are worth offering', () => {
	const line = (length: number): MeshEdge => ({
		points: [
			[0, 0, 0],
			[length, 0, 0],
		],
		normals: [
			[
				[0, 0, 1],
				[0, -1, 0],
			],
		],
		closed: false,
	});
	const bent = (): MeshEdge => ({
		points: [
			[0, 0, 0],
			[0.3, 0, 0],
			[0.3, 0.3, 0],
		],
		normals: [
			[
				[0, 0, 1],
				[0, -1, 0],
			],
			[
				[0, 0, 1],
				[1, 0, 0],
			],
		],
		closed: false,
	});

	it('measures an edge along its whole polyline', () => {
		expect(edgeLength(line(12))).toBe(12);
		expect(edgeLength(bent())).toBeCloseTo(0.6, 9);
	});

	it('drops edges shorter than half a millimetre (too small to pick or to treat) and keeps the rest in order', () => {
		const kept = usefulEdges([line(0.2), line(3), line(0.49), bent(), line(0.5)]);
		expect(kept).toHaveLength(3);
		expect(kept.map(edgeLength)).toEqual([3, expect.closeTo(0.6, 9), 0.5]);
		expect(MIN_EDGE_LENGTH).toBe(0.5);
	});

	it('counts the pieces an edge is drawn from', () => {
		expect(countSegments([line(1), bent()])).toBe(3);
		expect(countSegments([])).toBe(0);
	});
});
