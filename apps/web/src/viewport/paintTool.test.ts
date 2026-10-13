import { addShape, createEmptyDesign, groupNodes, setLocked, setNodeEuler, setNodeMode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { filamentForKey, fillFor, type PaintSettings } from './paintTool.ts';

const settings = (over: Partial<PaintSettings> = {}): PaintSettings => ({ color: '#2a9d8f', tool: 'smart', angle: 30, ...over });
const box = (at: [number, number] = [0, 0]) => addShape(createEmptyDesign('d'), 'box', at, { id: 'a' }).design;
const near = (got: readonly number[], want: readonly number[]) => {
	for (const [i, v] of got.entries()) expect(v).toBeCloseTo(want[i]!, 6);
};

describe('fillFor: a click on the surface becomes a fill in the shape’s own frame', () => {
	it('is the point and direction as they are for a shape at the origin, with the colour, tool and angle', () => {
		const r = fillFor(box(), { id: 'a', point: [3, 4, 20], normal: [0, 0, 1] }, settings());
		if ('problem' in r) throw new Error(r.problem);
		expect(r.id).toBe('a');
		expect(r.fill).toMatchObject({ kind: 'region', color: '#2a9d8f', point: [3, 4, 20], normal: [0, 0, 1], angle: 30 });
		expect(r.fill.id.length).toBeGreaterThan(0);
		expect('spread' in r.fill && r.fill.spread).toBeFalsy();
	});

	it('moves the point back by where the shape stands', () => {
		const r = fillFor(box([30, -10]), { id: 'a', point: [33, -6, 20], normal: [0, 0, 1] }, settings());
		if ('problem' in r) throw new Error(r.problem);
		near((r.fill as { point: number[] }).point, [3, 4, 20]);
	});

	it('turns the point and direction back by how the shape is turned (a quarter about Z: its +x faces world +y)', () => {
		const turned = setNodeEuler(box([30, 0]), 'a', [0, 0, 90]);
		const r = fillFor(turned, { id: 'a', point: [30, 10, 10], normal: [0, 1, 0] }, settings());
		if ('problem' in r) throw new Error(r.problem);
		near((r.fill as { point: number[] }).point, [10, 0, 10]);
		near((r.fill as { normal: number[] }).normal, [1, 0, 0]);
	});

	it('makes a bucket fill, with an erase when there is no colour, and gives each fill its own id', () => {
		const a = fillFor(box(), { id: 'a', point: [0, 0, 20], normal: [0, 0, 1] }, settings({ tool: 'bucket', color: null }));
		const b = fillFor(box(), { id: 'a', point: [0, 0, 20], normal: [0, 0, 1] }, settings());
		if ('problem' in a || 'problem' in b) throw new Error('refused');
		expect(a.fill).toMatchObject({ color: null, spread: 'bucket' });
		expect('angle' in a.fill).toBe(false); // the angle belongs to a smart fill
		expect(a.fill.id).not.toBe(b.fill.id);
	});

	it('paints a top-level group too (the group’s own frame, the middle of what it holds)', () => {
		const d = groupNodes(addShape(box(), 'cylinder', [60, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' }).design;
		const r = fillFor(d, { id: 'g', point: [0, 0, 20], normal: [0, 0, 1] }, settings());
		if ('problem' in r) throw new Error(r.problem);
		expect(r.id).toBe('g');
	});

	it('says why not, rather than painting: nothing under the pointer, a locked shape, a hole', () => {
		const say = (d: ReturnType<typeof box>, id?: string) =>
			fillFor(d, { ...(id && { id }), point: [0, 0, 20], normal: [0, 0, 1] }, settings());
		expect(say(box())).toEqual({ problem: expect.stringMatching(/shape/) });
		expect(say(setLocked(box(), ['a'], true), 'a')).toEqual({ problem: expect.stringMatching(/locked/) });
		expect(say(setNodeMode(box(), ['a'], 'hole'), 'a')).toEqual({ problem: expect.stringMatching(/hole/) });
		expect(say(box(), 'gone')).toEqual({ problem: expect.stringMatching(/shape/) });
	});
});

describe('filamentForKey', () => {
	it('is the filament (0-based) for the number keys 1 to 9 that the palette has, else null', () => {
		expect(filamentForKey('1', 4)).toBe(0);
		expect(filamentForKey('4', 4)).toBe(3);
		expect(filamentForKey('5', 4)).toBeNull();
		expect(filamentForKey('9', 16)).toBe(8);
		expect(filamentForKey('0', 16)).toBeNull();
		expect(filamentForKey('a', 4)).toBeNull();
		expect(filamentForKey('12', 16)).toBeNull();
	});
});
