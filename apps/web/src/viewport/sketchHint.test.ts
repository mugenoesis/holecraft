import { createSketchEditor, rectangleOutline, type SketchEditorState, sketchReducer } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { sketchHint } from './sketchHint.ts';

const state = (over: Partial<SketchEditorState>): SketchEditorState => ({ ...createSketchEditor(), ...over });

describe('the Sketch hint', () => {
	it('says how to draw with the tool in use', () => {
		expect(sketchHint(state({ tool: 'rectangle' }))).toMatch(/Drag from one corner/);
		expect(sketchHint(state({ tool: 'circle' }))).toMatch(/centre/);
		expect(sketchHint(state({ tool: 'polygon', sides: 5 }))).toMatch(/5 sides/);
		expect(sketchHint(state({ tool: 'line' }))).toMatch(/Click to add points/);
		expect(sketchHint(state({ tool: 'select' }))).toMatch(/Click an outline/);
	});

	it('says what to do next for a line as it grows: close it once it can be, then how', () => {
		let s = state({ tool: 'line' });
		s = sketchReducer(s, { type: 'down', at: [0, 0], reach: 1 });
		expect(sketchHint(s)).toMatch(/Click the next point/);
		for (const at of [
			[10, 0],
			[10, 10],
		] as [number, number][])
			s = sketchReducer(s, { type: 'down', at, reach: 1 });
		expect(sketchHint(s)).toMatch(/first point or press Enter to close/);
		expect(sketchHint(s)).toMatch(/Backspace/);
	});

	it('says what a selection can do', () => {
		const s = createSketchEditor([rectangleOutline([0, 0], [10, 10])]);
		const picked = sketchReducer(sketchReducer(s, { type: 'down', at: [5, 5], reach: 1 }), { type: 'up', at: [5, 5] });
		expect(sketchHint(picked)).toMatch(/Drag to move it/);
		expect(sketchHint(picked)).toMatch(/Delete/);
	});
});

describe('the Sketch hint for curves', () => {
	it('walks through an arc: where it starts, a point it passes through, where it ends, and how to close', () => {
		let s = state({ tool: 'arc' });
		expect(sketchHint(s)).toMatch(/where the arc starts/);
		s = sketchReducer(s, { type: 'down', at: [0, 0], reach: 1 });
		expect(sketchHint(s)).toMatch(/passes through/);
		s = sketchReducer(s, { type: 'down', at: [5, -3], reach: 1 });
		expect(sketchHint(s)).toMatch(/where this arc ends/);
		expect(sketchHint(s)).toMatch(/first point to close/);
		s = sketchReducer(s, { type: 'down', at: [10, 0], reach: 1 });
		expect(sketchHint(s)).toMatch(/Enter closes with a straight side/);
	});

	it('says how to draw a spline, as it grows', () => {
		let s = state({ tool: 'spline' });
		expect(sketchHint(s)).toMatch(/smooth curve goes through all/);
		s = sketchReducer(s, { type: 'down', at: [0, 0], reach: 1 });
		expect(sketchHint(s)).toMatch(/Click the next point/);
		for (const at of [
			[10, 0],
			[10, 10],
		] as [number, number][])
			s = sketchReducer(s, { type: 'down', at, reach: 1 });
		expect(sketchHint(s)).toMatch(/close the curve/);
	});
});
