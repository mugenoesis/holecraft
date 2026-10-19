import { addShape, createEmptyDesign, libraryShapeOf, setShapeSize, type WorkPlane } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { type Placing, placementAction, placingHint, placingSize, samePlacing } from './placing.ts';

const box: Placing = { kind: 'shape', type: 'box' };

function saved(): Placing {
	let d = addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'a' }).design;
	d = setShapeSize(d, 'a', { width: 30, depth: 12, height: 8 });
	return { kind: 'saved', id: 'lib1', name: 'My bracket', shape: libraryShapeOf(d, 'a', 'My bracket')! };
}

describe('how big the ghost of what is being placed is', () => {
	it('a shape is the size it is added at', () => {
		expect(placingSize(box)).toEqual([20, 20, 20]);
	});

	it('a saved shape is the box round it', () => {
		expect(placingSize(saved())).toEqual([30, 12, 8]);
	});
});

describe('whether two things being placed are the same', () => {
	it('is the same shape, or the same saved shape', () => {
		expect(samePlacing(box, { kind: 'shape', type: 'box' })).toBe(true);
		expect(samePlacing(box, { kind: 'shape', type: 'cone' })).toBe(false);
		expect(samePlacing(saved(), saved())).toBe(true);
		expect(samePlacing(box, saved())).toBe(false);
		expect(samePlacing(box, null)).toBe(false);
	});
});

describe('the line under the Shapes heading', () => {
	it('says how to place a shape, by mouse', () => {
		expect(placingHint(null, false)).toMatch(/Click a shape, then click the plane/);
	});

	it('says how to add one on a touch screen: a tap, or press and hold and drag', () => {
		expect(placingHint(null, true)).toMatch(/Tap a shape to add it/);
		expect(placingHint(null, true)).toMatch(/press and hold/);
	});

	it('names what is being placed, and how to stop', () => {
		expect(placingHint(box, false)).toMatch(/Placing a Box: click the plane to put it down\. Esc cancels\./);
		expect(placingHint(saved(), false)).toMatch(/Placing My bracket/);
	});
});

describe('what putting something down does to the design', () => {
	it('adds a shape on the floor, or on a plane', () => {
		expect(placementAction(box, { at: [10, 20] })).toEqual({ type: 'add', shape: 'box', at: [10, 20] });
		const plane: WorkPlane = { origin: [0, 0, 20], normal: [0, 0, 1] };
		expect(placementAction(box, { plane, point: [1, 2, 20] })).toEqual({ type: 'addOnPlane', shape: 'box', plane, point: [1, 2, 20] });
	});

	it('adds a saved shape (already opened) on the floor, or on a plane', () => {
		const item = saved();
		if (item.kind !== 'saved') throw new Error('expected a saved shape');
		expect(placementAction(item, { at: [10, 20] })).toEqual({ type: 'addLibrary', shape: item.shape, at: [10, 20] });
		const plane: WorkPlane = { origin: [0, 0, 20], normal: [0, 0, 1] };
		expect(placementAction(item, { plane, point: [1, 2, 20] })).toEqual({
			type: 'addLibrary',
			shape: item.shape,
			plane,
			point: [1, 2, 20],
		});
	});
});
