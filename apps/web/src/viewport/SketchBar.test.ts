import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SketchBar } from './SketchBar.tsx';

const noop = () => {};
const render = (over: Partial<Parameters<typeof SketchBar>[0]> = {}) =>
	renderToStaticMarkup(
		createElement(SketchBar, {
			tool: 'rectangle',
			sides: 6,
			snap: 1,
			height: '10',
			hint: 'Drag from one corner to the opposite one',
			canFinish: true,
			canDelete: false,
			canReshape: false,
			editing: false,
			onTool: noop,
			onSides: noop,
			onSnap: noop,
			onHeight: noop,
			onDelete: noop,
			onStraighten: noop,
			onSmooth: noop,
			onCancel: noop,
			onFinish: noop,
			...over,
		}),
	);

describe('the Sketch bar', () => {
	it('has the five drawing tools, the one in use pressed', () => {
		const html = render({ tool: 'line' });
		for (const name of ['Select', 'Rectangle', 'Circle', 'Polygon', 'Line']) expect(html).toContain(`>${name}</button>`);
		expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
		expect(html).toMatch(/aria-pressed="true"[^>]*>Line<\/button>|>Line<\/button>/);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Line<\/button>/);
	});

	it('has a Sides number for Polygon only enabled while Polygon is the tool, between 3 and 32', () => {
		expect(render({ tool: 'polygon', sides: 8 })).toMatch(/<input[^>]*aria-label="Sides"[^>]*min="3"[^>]*max="32"[^>]*value="8"/);
		expect(render({ tool: 'polygon' })).not.toMatch(/aria-label="Sides"[^>]*disabled/);
		expect(render({ tool: 'rectangle' })).toMatch(/aria-label="Sides"[^>]*disabled=""/);
	});

	it('has the snap switch with its grid size, on or off, and the extrude height as typed', () => {
		const on = render({ snap: 2 });
		expect(on).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
		expect(on).toContain('Snap to grid (2 mm)');
		expect(render({ snap: 0 })).not.toMatch(/type="checkbox"[^>]*checked=""/);
		expect(render({ height: '12.5' })).toMatch(/<input[^>]*aria-label="Extrude height"[^>]*value="12.5"/);
	});

	it('shows the hint for the tool, and Delete selected only able to act when something is selected', () => {
		expect(render({ hint: 'Click to add points' })).toContain('Click to add points');
		expect(render({ canDelete: false })).toMatch(/<button[^>]*disabled=""[^>]*>Delete selected<\/button>/);
		expect(render({ canDelete: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>Delete selected<\/button>/);
	});

	it('has Cancel and Finish, Finish off while there is no drawing, and says Done when editing a sketch that is already there', () => {
		const html = render();
		expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
		expect(html).toMatch(/<button[^>]*class="primary"[^>]*>Finish<\/button>/);
		expect(render({ canFinish: false })).toMatch(
			/<button[^>]*disabled=""[^>]*class="primary"[^>]*>Finish<\/button>|<button[^>]*class="primary"[^>]*disabled=""[^>]*>Finish<\/button>/,
		);
		expect(render({ editing: true })).toMatch(/<button[^>]*class="primary"[^>]*>Finish<\/button>/);
	});
});

describe('the Sketch bar with curves', () => {
	it('has the Arc and Spline tools after Line', () => {
		const html = render({ tool: 'arc' });
		const names = [...html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>([A-Za-z]+)<\/button>/g)].map((m) => m[1]);
		expect(names).toEqual(['Select', 'Rectangle', 'Circle', 'Polygon', 'Line', 'Arc', 'Spline']);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Arc<\/button>/);
	});

	it('has Straighten sides and Smooth corners only when an outline is selected', () => {
		expect(render({ canReshape: false })).not.toContain('Straighten sides');
		expect(render({ canReshape: false })).not.toContain('Smooth corners');
		const html = render({ canReshape: true });
		expect(html).toMatch(/<button[^>]*>Straighten sides<\/button>/);
		expect(html).toMatch(/<button[^>]*>Smooth corners<\/button>/);
	});
});
