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
