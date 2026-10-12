import { addShape, createEmptyDesign, type MeshEdge, moveNodes, setShapeSize, type Vec3 } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { drawEdges, initialEdgeSize, sliderMax, statusText } from './edgeDrawing.ts';

/** A box's top front edge (2 points) and a three-point run (2 segments), in the shape's own frame. */
const LINE: MeshEdge = {
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
const BENT: MeshEdge = {
	points: [
		[0, 0, 0],
		[1, 0, 0],
		[1, 1, 0],
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
};
const MOVED = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, 0, 1]; // 30 mm along x

/** A flat view: x and y in mm become pixels; points with x below `hiddenBelow` are behind something. */
const view = (hiddenBelow = -Infinity) => ({
	project: (p: Vec3) => ({ x: p[0], y: p[1] }),
	canSee: (p: Vec3) => p[0] >= hiddenBelow,
});

describe('drawing the offered edges', () => {
	it('places them by the node’s transform and labels each by its ends in the world', () => {
		const [drawn] = drawEdges(view(), MOVED, [LINE]);
		expect(drawn).toMatchObject({ index: 0, from: [20, -10, 20], to: [40, -10, 20] });
		expect(drawn!.segments).toEqual([{ edge: 0, a: { x: 20, y: -10 }, b: { x: 40, y: -10 } }]);
	});

	it('leaves out the pieces that are hidden (judged at their middle), keeping the edge itself', () => {
		const drawn = drawEdges(
			view(0.75),
			MOVED.map((v, i) => (i === 12 ? 0 : v)),
			[BENT],
		);
		expect(drawn[0]!.segments.map((s) => s.b)).toEqual([{ x: 1, y: 1 }]); // the first piece's middle (x 0.5) is hidden
	});

	it('draws nothing without a view, or where the view can’t place a point', () => {
		expect(drawEdges(null, MOVED, [LINE])).toEqual([]);
		const behind = { project: () => null, canSee: () => true };
		expect(drawEdges(behind, MOVED, [LINE])[0]!.segments).toEqual([]);
	});
});

describe('the bar', () => {
	const design = moveNodes(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, ['a'], [5, 0, 0]);

	it('starts at about 5% of the part, and the slider reaches half its smallest side', () => {
		expect(initialEdgeSize(design, 'a')).toBe(1);
		expect(sliderMax(design, 'a', 1)).toBe(10);
		expect(sliderMax(design, 'a', 14)).toBe(14); // a bigger typed size stays reachable
		expect(initialEdgeSize(design, 'missing')).toBe(1);
	});

	it('measures from the smallest side, not the largest', () => {
		const flat = setShapeSize(design, 'a', { width: 60, height: 8 });
		expect(sliderMax(flat, 'a', 0.4)).toBe(4);
		expect(initialEdgeSize(flat, 'a')).toBe(0.4);
	});

	it('says what is going on', () => {
		expect(statusText({ kind: 'loading' }, 0)).toBe('Finding edges…');
		expect(statusText({ kind: 'failed', message: 'no worker' }, 0)).toBe('The edges could not be found: no worker');
		expect(statusText({ kind: 'ready', key: 'k', edges: [] }, 0)).toBe('This part has no sharp edges to chamfer or round');
		expect(statusText({ kind: 'ready', key: 'k', edges: [LINE] }, 0)).toBe('Click an edge to choose it (Shift adds more)');
		expect(statusText({ kind: 'ready', key: 'k', edges: [LINE] }, 1)).toBe('1 edge chosen (Shift adds more)');
		expect(statusText({ kind: 'ready', key: 'k', edges: [LINE, BENT] }, 2)).toBe('2 edges chosen');
	});
});
