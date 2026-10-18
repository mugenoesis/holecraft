import { addShape, createEmptyDesign, type Design, moveNodes, setSupportPoints } from '@holecraft/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupportsGroup } from './SupportsGroup.tsx';
import type { SupportsUi } from './useSupportsUi.ts';
import { SupportMarkers } from './viewport/SupportMarkers.tsx';
import { SupportsLayer } from './viewport/SupportsLayer.tsx';
import type { SupportsView } from './viewport/supportsView.ts';
import type { Viewport } from './viewport/Viewport.ts';

const POINTS = { objects: [{ points: [1, 2, 3].map((x) => ({ x, y: 0, z: 0, radius: 0.4, type: 'island' as const })) }] };
const withPoints = (): Design => setSupportPoints(addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'b' }).design, POINTS);
const ui = (over: Partial<SupportsUi> = {}): SupportsUi => ({
	show: true,
	setShow: () => {},
	adding: false,
	setAdding: () => {},
	toggleAdding: () => {},
	selected: null,
	setSelected: () => {},
	...over,
});
const group = (design: Design, state = ui()) =>
	renderToStaticMarkup(createElement(SupportsGroup, { design, meshes: new Map(), dispatch: () => {}, ui: state }));

describe('the Supports group of the Resin panel', () => {
	it('before any points, offers to generate them and shows no point controls', () => {
		const html = group(addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'b' }).design);
		expect(html).toContain('Generate support points');
		expect(html).toContain('Printer for the points');
		expect(html).not.toContain('Show points');
	});

	it('with points, says how many, and offers to show, add, delete and start again', () => {
		const html = group(withPoints());
		expect(html).toContain('3 points (from Trident)');
		for (const text of ['Show points', 'Add point', 'Delete point', 'Delete all', 'Back to generated', 'Tip radius'])
			expect(html).toContain(text);
		expect(html).not.toContain('shape changed since the points were made');
	});

	it('shows the chosen point’s width, and Add point as pressed while adding', () => {
		const design = withPoints();
		const id = design.supports!.points[1]!.id;
		const html = group(design, ui({ selected: id, adding: true }));
		expect(html).toMatch(/aria-label="Tip radius"[^>]*value="0.4"|value="0.4"[^>]*aria-label="Tip radius"/);
		expect(html).toMatch(/aria-pressed="true"[^>]*>Add point/);
	});

	it('warns when a shape was moved after the points were made', () => {
		const moved = moveNodes(withPoints(), ['b'], [5, 0, 0]);
		expect(group(moved)).toContain('shape changed since the points were made');
	});
});

/** A viewport that projects (x, y, z) to (x, y) and cannot pick anything. */
const fakeViewport = { project: ([x, y]: number[]) => ({ x: x! * 10, y: y! * 10 }) } as unknown as Viewport;

describe('the support point markers', () => {
	const markers = (selected: string | null, getViewport: () => Viewport | null = () => fakeViewport) => {
		const design = withPoints();
		return renderToStaticMarkup(
			createElement(SupportMarkers, {
				points: design.supports!.points,
				selected: selected ?? design.supports!.points[selected === null ? 99 : 0]?.id ?? null,
				getViewport,
				camera: null,
				onSelect: () => {},
				onDragStart: () => {},
				onMove: () => {},
				onDragEnd: () => {},
				onRemove: () => {},
			}),
		);
	};

	it('draws a button for each point where the view puts it, with its numbers', () => {
		const html = markers(null);
		expect(html.match(/data-testid="support-point"/g)).toHaveLength(3);
		expect(html).toContain('data-x="2"');
		expect(html).toContain('left:20px');
		expect(html).toContain('aria-label="Support point 2 of 3"');
		expect(html).toContain('data-radius="0.4"');
	});

	it('marks the chosen one, and the ones you added', () => {
		const design = withPoints();
		const html = renderToStaticMarkup(
			createElement(SupportMarkers, {
				points: [...design.supports!.points, { id: 'mine', object: 0, x: 5, y: 5, z: 0, radius: 0.4, type: 'manual' as const }],
				selected: 'mine',
				getViewport: () => fakeViewport,
				camera: null,
				onSelect: () => {},
				onDragStart: () => {},
				onMove: () => {},
				onDragEnd: () => {},
				onRemove: () => {},
			}),
		);
		expect(html).toContain('support-point selected manual');
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
	});

	it('draws nothing before the view exists', () => {
		expect(markers(null, () => null)).toBe('');
	});
});

describe('the support layer over the view', () => {
	const view = (over: Partial<SupportsView> = {}): SupportsView => ({
		points: withPoints().supports!.points,
		selected: null,
		show: true,
		adding: false,
		onSelect: () => {},
		onDragStart: () => {},
		onMove: () => {},
		onDragEnd: () => {},
		onRemove: () => {},
		onAdd: () => {},
		onStopAdding: () => {},
		...over,
	});
	const layer = (supports: SupportsView | undefined, active = true) =>
		renderToStaticMarkup(createElement(SupportsLayer, { supports, active, getViewport: () => fakeViewport, camera: null }));

	it('shows the points when they are on, and not when hidden, empty, or another tool has the view', () => {
		expect(layer(view())).toContain('support-point');
		expect(layer(view({ show: false }))).toBe('');
		expect(layer(view({ points: [] }))).toBe('');
		expect(layer(view(), false)).toBe('');
		expect(layer(undefined)).toBe('');
	});
});
