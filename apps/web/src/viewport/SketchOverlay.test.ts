import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SketchOverlay } from './SketchOverlay.tsx';

const toScreen = ([x, y]: [number, number]): [number, number] => [x * 2, 100 - y * 2];
const square = (x: number, y: number, s: number) => ({
	points: [
		[x, y],
		[x + s, y],
		[x + s, y + s],
		[x, y + s],
	] as [number, number][],
});
const render = (over: Partial<Parameters<typeof SketchOverlay>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(SketchOverlay, { outlines: [], selected: null, draftShape: null, draftLine: null, toScreen, ...over }),
	);

describe('the sketch overlay', () => {
	it('draws all the outlines as one filled path (even-odd, so one inside another is a hole), at their screen positions', () => {
		const html = render({ outlines: [square(0, 0, 10), square(2, 2, 4)] });
		expect(html.match(/<path/g)).toHaveLength(1);
		expect(html).toContain('fill-rule="evenodd"');
		expect(html).toContain('M0,100L20,100L20,80L0,80Z');
		expect(html).toContain('M4,96L12,96L12,88L4,88Z');
	});

	it('draws nothing for nothing', () => {
		expect(render()).not.toContain('<path');
	});

	it('shows the handles of the selected outline (and which point is selected), and none otherwise', () => {
		const some = render({ outlines: [square(0, 0, 10), square(20, 0, 4)], selected: { outline: 0, point: 2 } });
		expect(some.match(/data-testid="sketch-handle"/g)).toHaveLength(4);
		expect(some).toMatch(/class="[^"]*selected"[^>]*data-point="2"/);
		expect(render({ outlines: [square(0, 0, 10)], selected: null })).not.toContain('sketch-handle');
	});

	it('draws a shape being dragged out as its own outline, drawn lighter', () => {
		const html = render({ draftShape: square(0, 0, 5) });
		expect(html).toMatch(/data-testid="sketch-draft"/);
		expect(html).toContain('M0,100L10,100L10,90L0,90Z');
	});

	it('draws a line being clicked out: its points, the lines between them, and a rubber band to the pointer', () => {
		const html = render({
			draftLine: {
				points: [
					[0, 0],
					[10, 0],
					[10, 10],
				],
				hover: [5, 8],
			},
		});
		expect(html).toContain('0,100 20,100 20,80');
		expect(html.match(/data-testid="sketch-point"/g)).toHaveLength(3);
		expect(html).toMatch(/data-testid="sketch-rubber"[^>]*x1="20"[^>]*y1="80"[^>]*x2="10"[^>]*y2="84"/);
	});

	it('leaves out the rubber band with no pointer, and shows the first point as a place to close the line once there are three points', () => {
		const noHover = render({ draftLine: { points: [[0, 0]], hover: null } });
		expect(noHover).not.toContain('sketch-rubber');
		expect(noHover).not.toContain('closable');
		const three = render({
			draftLine: {
				points: [
					[0, 0],
					[10, 0],
					[10, 10],
				],
				hover: null,
			},
		});
		expect(three).toContain('closable');
	});
});

describe('the sketch overlay with curves', () => {
	const circle = {
		points: [
			[-10, 0],
			[10, 0],
		] as [number, number][],
		segments: [1, 1] as (number | 'line' | 'curve')[],
	};

	it('draws a curved outline as many short pieces of its true curve', () => {
		const html = render({ outlines: [circle] });
		expect(html.match(/L/g)!.length).toBeGreaterThan(20);
	});

	it('shows a diamond in the middle of every side of the selected outline, the selected side filled', () => {
		const html = render({ outlines: [square(0, 0, 10)], selected: { outline: 0, segment: 1 } });
		expect(html.match(/data-testid="sketch-mid"/g)).toHaveLength(4);
		expect(html).toMatch(/class="[^"]*selected"[^>]*data-segment="1"|data-segment="1"[^>]*class="[^"]*selected"/);
		expect(render({ outlines: [square(0, 0, 10)], selected: null })).not.toContain('sketch-mid');
	});

	it('puts the diamonds on the curve, not on the chord: a circle’s two are at the bottom and the top', () => {
		const html = render({ outlines: [circle], selected: { outline: 0 } });
		expect(html).toMatch(/data-segment="0"[^>]*d="M0,114 /);
		expect(html).toMatch(/data-segment="1"[^>]*d="M0,74 /);
	});

	it('draws a path of arcs being clicked out: the arcs so far, the next one dashed, the point it goes through and the corners', () => {
		const html = render({
			draftArc: {
				points: [
					[0, 0],
					[10, 0],
				],
				through: [14, 6],
				placed: [
					[0, 0],
					[5, -5],
					[10, 0],
				],
				preview: [
					[10, 0],
					[12, 3],
					[14, 6],
				],
			},
		});
		expect(html).toContain('0,100 10,110 20,100');
		expect(html).toMatch(/data-testid="sketch-arc-preview"[^>]*points="20,100 24,94 28,88"/);
		expect(html.match(/data-testid="sketch-point"/g)).toHaveLength(2);
		expect(html).toContain('data-testid="sketch-through"');
	});

	it('draws a spline being clicked out: the smooth curve, and its corners with the first one ready to close it once there are three', () => {
		const html = render({
			draftSpline: {
				points: [
					[0, 0],
					[10, 0],
					[10, 10],
				],
				curve: [
					[0, 0],
					[5, -1],
					[10, 0],
					[11, 5],
					[10, 10],
				],
			},
		});
		expect(html).toContain('0,100 10,102 20,100 22,90 20,80');
		expect(html.match(/data-testid="sketch-point"/g)).toHaveLength(3);
		expect(html).toContain('closable');
	});
});
