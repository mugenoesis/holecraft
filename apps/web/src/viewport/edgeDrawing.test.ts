import { addShape, createEmptyDesign, type MeshEdge, moveNodes, setShapeSize, type Vec3 } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { initialEdgeSize, projectEdges, sliderMax, statusText } from './edgeDrawing.ts';

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

/** A flat view: x and y in mm become pixels. A face "faces the camera" when its normal points along +z (the camera is above). */
const view = (opts: { facing?: (n: Vec3) => boolean } = {}) => ({
	project: (p: Vec3) => ({ x: p[0], y: p[1] }),
	facesCamera: (_p: Vec3, n: Vec3) => (opts.facing ? opts.facing(n) : n[2] > 0),
});

describe('projecting the offered edges', () => {
	it('places them by the node’s transform and labels each by its ends in the world', () => {
		const [drawn] = projectEdges(view(), MOVED, [LINE]);
		expect(drawn).toMatchObject({ index: 0, from: [20, -10, 20], to: [40, -10, 20] });
		expect(drawn!.segments).toEqual([{ edge: 0, key: '0:0', mid: [30, -10, 20], a: { x: 20, y: -10 }, b: { x: 40, y: -10 } }]);
	});

	it('gives each piece a key that stays the same for the same piece (edge number, then piece number)', () => {
		const [drawn] = projectEdges(view(), MOVED, [BENT]);
		expect(drawn!.segments.map((s) => s.key)).toEqual(['0:0', '0:1']);
	});

	it('turns the faces with the node, so a shape turned upside down is judged by where its faces point now', () => {
		const upsideDown = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]; // half a turn about x: the top face now points down
		expect(projectEdges(view(), upsideDown, [LINE])[0]!.segments).toEqual([]);
		expect(projectEdges(view(), MOVED, [LINE])[0]!.segments).toHaveLength(1);
	});

	it('keeps a piece if either of the faces that meet there faces the camera, and drops it if neither does (no ray needed)', () => {
		const sideFacing = (n: Vec3) => n[1] < 0; // the camera is out in front: only the front (-y) face of LINE faces it
		expect(projectEdges(view({ facing: sideFacing }), MOVED, [LINE])[0]!.segments).toHaveLength(1);
		expect(projectEdges(view({ facing: () => false }), MOVED, [LINE])[0]!.segments).toEqual([]);
	});

	it('keeps the edge itself even when none of its pieces are drawn', () => {
		const [drawn] = projectEdges(view({ facing: () => false }), MOVED, [LINE]);
		expect(drawn).toMatchObject({ index: 0, from: [20, -10, 20], to: [40, -10, 20], segments: [] });
	});

	it('draws nothing without a view, or where the view can’t place a point', () => {
		expect(projectEdges(null, MOVED, [LINE])).toEqual([]);
		const behind = { project: () => null, facesCamera: () => true };
		expect(projectEdges(behind, MOVED, [LINE])[0]!.segments).toEqual([]);
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
		expect(statusText({ kind: 'tooMany', segments: 12345 }, 0)).toBe(
			'This part has too many small edges to choose from (12345). Apply edge treatments last, once the shapes are grouped how you want them',
		);
	});
});
