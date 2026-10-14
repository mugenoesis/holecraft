import { addPaint, addShape, createEmptyDesign, groupNodes, setLocked, setNodeEuler, setNodeMode } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { filamentForKey, fillFor, gapFillFor, type PaintSettings, startStroke } from './paintTool.ts';

const settings = (over: Partial<PaintSettings> = {}): PaintSettings => ({
	color: '#2a9d8f',
	tool: 'smart',
	angle: 30,
	shape: 'circle',
	size: 6,
	height: 2,
	gapArea: 1,
	...over,
});
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

	it('says why a group stretched along its own axes cannot be painted', () => {
		const d = groupNodes(addShape(box(), 'cylinder', [60, 0], { id: 'b' }).design, ['a', 'b'], { id: 'g' }).design;
		const stretched = { ...d, nodes: { ...d.nodes, g: { ...d.nodes.g!, scale: [2, 1, 1] } as never } };
		expect(fillFor(stretched, { id: 'g', point: [0, 0, 20], normal: [0, 0, 1] }, settings())).toEqual({
			problem: expect.stringMatching(/stretched/),
		});
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

describe('brush strokes', () => {
	const brush = (over: Partial<PaintSettings> = {}) => settings({ tool: 'brush', ...over });
	const at = (x: number, y = 0, id = 'a') => ({
		id,
		point: [x, y, 20] as [number, number, number],
		normal: [0, 0, 1] as [number, number, number],
	});
	const begin = (design = box(), over: Partial<PaintSettings> = {}) => {
		const s = startStroke(design, at(0), brush(over));
		if ('problem' in s) throw new Error(s.problem);
		return s;
	};

	it('fillFor makes a one-dab stroke for the brush: its shape, a radius of half the size, the colour and the dab in the shape’s frame', () => {
		const r = fillFor(box([30, 0]), { id: 'a', point: [33, 4, 20], normal: [0, 0, 1] }, brush({ shape: 'sphere', size: 8 }));
		if ('problem' in r) throw new Error(r.problem);
		expect(r.fill).toMatchObject({ kind: 'brush', shape: 'sphere', radius: 4, color: '#2a9d8f' });
		near((r.fill as { dabs: { point: number[] }[] }).dabs[0]!.point, [3, 4, 20]);
	});

	it('starts with its first dab and gives the whole stroke as one fill', () => {
		const s = begin();
		expect(s.id).toBe('a');
		expect(s.fill()).toMatchObject({ kind: 'brush', shape: 'circle', radius: 3, color: '#2a9d8f' });
		expect((s.fill() as { dabs: unknown[] }).dabs).toHaveLength(1);
	});

	it('adds a dab once the pointer has moved a third of the radius, not before, and says whether it changed', () => {
		const s = begin(); // radius 3: a dab every mm
		expect(s.add(at(0.4))).toBe(false);
		expect(s.add(at(1.2))).toBe(true);
		expect(s.add(at(1.5))).toBe(false); // 0.3 from the last dab
		expect(s.add(at(2.3))).toBe(true);
		expect((s.fill() as { dabs: unknown[] }).dabs).toHaveLength(3);
	});

	it('keeps its fill’s id, and a new stroke has its own', () => {
		const s = begin();
		const id = s.fill().id;
		s.add(at(5));
		expect(s.fill().id).toBe(id);
		expect(begin().fill().id).not.toBe(id);
	});

	it('ignores the pointer over another object or the floor', () => {
		const s = begin();
		expect(s.add({ ...at(5), id: 'other' })).toBe(false);
		expect(s.add({ point: [5, 0, 0], normal: [0, 0, 1] })).toBe(false);
		expect((s.fill() as { dabs: unknown[] }).dabs).toHaveLength(1);
	});

	it('stops at the most dabs a stroke may have', () => {
		const s = begin();
		for (let i = 1; i < 400; i++) s.add(at(i * 2));
		expect((s.fill() as { dabs: unknown[] }).dabs).toHaveLength(300);
		expect(s.add(at(2000))).toBe(false);
	});

	it('erases with no colour, and a triangle brush has no radius to space by (a dab every half mm)', () => {
		const e = begin(box(), { color: null });
		expect(e.fill().color).toBeNull();
		const t = begin(box(), { shape: 'triangle' });
		expect(t.add(at(0.3))).toBe(false);
		expect(t.add(at(0.6))).toBe(true);
	});

	it('says why not, as a click does: a locked shape, the floor', () => {
		expect(startStroke(setLocked(box(), ['a'], true), at(0), brush())).toEqual({ problem: expect.stringMatching(/locked/) });
		expect(startStroke(box(), { point: [0, 0, 0], normal: [0, 0, 1] }, brush())).toEqual({ problem: expect.stringMatching(/shape/) });
	});
});

describe('height range bands', () => {
	const height = (over: Partial<PaintSettings> = {}) => settings({ tool: 'height', ...over });
	const made = (design: ReturnType<typeof box>, hit: Parameters<typeof fillFor>[1], over: Partial<PaintSettings> = {}) => {
		const r = fillFor(design, hit, height(over));
		if ('problem' in r) throw new Error(r.problem);
		return r.fill as unknown as { kind: string; origin: number[]; up: number[]; height: number; color: string | null };
	};

	it('is a band from the height of the click up by the height setting, along the world’s up', () => {
		const f = made(box(), { id: 'a', point: [3, 4, 7.5], normal: [1, 0, 0] }, { height: 2.5 });
		expect(f.kind).toBe('band');
		near(f.origin, [3, 4, 7.5]);
		near(f.up, [0, 0, 1]);
		expect(f.height).toBe(2.5);
		expect(f.color).toBe('#2a9d8f');
	});

	it('keeps the world’s up when the shape is turned: for a quarter about X the world’s up is the shape’s own +y', () => {
		const turned = setNodeEuler(box(), 'a', [90, 0, 0]);
		const f = made(turned, { id: 'a', point: [0, 0, 7], normal: [0, -1, 0] });
		near(f.up, [0, 1, 0]);
	});

	it('moves the origin back by where the shape stands, and erases with no colour', () => {
		const f = made(box([30, 0]), { id: 'a', point: [33, 4, 7.5], normal: [1, 0, 0] }, { color: null });
		near(f.origin, [3, 4, 7.5]);
		expect(f.color).toBeNull();
	});
});

describe('gapFillFor', () => {
	const gaps = (d: ReturnType<typeof box>, ids: string[], over: Partial<PaintSettings> = {}) =>
		gapFillFor(d, ids, settings({ tool: 'gaps', ...over }));
	const painted = () => addPaint(box(), 'a', { id: 'f', kind: 'region', color: '#2a9d8f', point: [0, 0, 20], normal: [0, 0, 1] });

	it('is one fill, with the area, for the selected shapes that can be painted and have paint to tidy', () => {
		const r = gaps(painted(), ['a'], { gapArea: 2.4 });
		if ('problem' in r) throw new Error(r.problem);
		expect(r.ids).toEqual(['a']);
		expect(r.fill).toMatchObject({ kind: 'gaps', color: null, area: 2.4 });
		expect(r.fill.id.length).toBeGreaterThan(0);
	});

	it('leaves out shapes that are locked or have no paint, and says why when there is nothing to do', () => {
		expect(gaps(box(), ['a'])).toEqual({ problem: expect.stringMatching(/paint/) });
		expect(gaps(box(), [])).toEqual({ problem: expect.stringMatching(/Select/) });
		expect(gaps(setLocked(painted(), ['a'], true), ['a'])).toEqual({ problem: expect.stringMatching(/paint/) });
	});
});
