import { addShape, createEmptyDesign, groupNodes, type MeshEdge, setHidden, translation } from '@holecraft/core';
import { toolEdgesKey } from '@holecraft/geometry';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Readout, SnapMarker } from './RulerOverlay.tsx';
import { placedEdges, visibleRoots } from './useSnapEdges.ts';

const twoBoxes = () => {
	let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'cylinder', [100, 0], { id: 'b' }).design; // a different shape, so its edges have their own key
	return d;
};
const edge = (...points: [number, number, number][]): MeshEdge => ({ points, normals: [], closed: false }) as unknown as MeshEdge;

describe('what the ruler can snap to', () => {
	it('is the shapes and groups on show at the top level: not a hidden one, and not what is inside a group', () => {
		let d = twoBoxes();
		d = addShape(d, 'box', [0, 50], { id: 'c' }).design;
		d = groupNodes(d, ['b', 'c'], { id: 'g' }).design;
		expect(visibleRoots(d).sort()).toEqual(['a', 'g']);
		expect(visibleRoots(setHidden(d, ['a'], true))).toEqual(['g']);
	});

	it('places the edges found so far where their shapes are, and has none for a shape whose edges have not come yet', () => {
		const d = twoBoxes();
		const wanted = [
			['a', toolEdgesKey(d, 'a', { treated: true })],
			['b', toolEdgesKey(d, 'b', { treated: true })],
		] as const;
		const moved = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, transform: translation(100, 0, 5) } } };
		const known = new Map([[wanted[1][1], [edge([0, 0, 0], [10, 0, 0])]]]);
		const placed = placedEdges(moved, wanted, known);
		expect(placed).toHaveLength(1); // only b's edges have arrived
		expect(placed[0]!.points).toEqual([
			[100, 0, 5],
			[110, 0, 5],
		]);
		expect(placedEdges(d, wanted, new Map())).toEqual([]);
	});
});

describe('the ruler readout and markers', () => {
	const measurement = { distance: 28.28, delta: [20, -20, 0] as [number, number, number] };
	const readout = (props: Partial<Parameters<typeof Readout>[0]> = {}) =>
		renderToStaticMarkup(
			createElement(Readout, { measurement: null, started: false, units: 'mm', snapOn: true, onSnap: () => {}, ...props }),
		);

	it('shows the distance and the offset on each axis, or what to click next', () => {
		const done = readout({ measurement });
		expect(done).toContain('<strong>28.28 mm</strong>');
		expect(done).toContain('X 20 mm');
		expect(done).toContain('Y -20 mm');
		expect(readout()).toContain('Click a face or the workplane to start measuring');
		expect(readout({ started: true })).toContain('Click where to measure to');
	});

	it('has a Snap switch that shows whether it is on', () => {
		expect(readout({ snapOn: true })).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
		expect(readout({ snapOn: false })).not.toMatch(/<input[^>]*checked/);
		expect(readout()).toContain('Snap to corners and edges');
	});

	it('marks what it caught: a square for a corner, a triangle for a middle, a ring for an edge', () => {
		const mark = (kind: 'corner' | 'middle' | 'edge') =>
			renderToStaticMarkup(createElement('svg', null, createElement(SnapMarker, { x: 50, y: 40, kind })));
		expect(mark('corner')).toMatch(/<rect[^>]*data-kind="corner"/);
		expect(mark('middle')).toMatch(/<polygon[^>]*data-kind="middle"/);
		expect(mark('edge')).toMatch(/<circle[^>]*data-kind="edge"/);
	});
});
