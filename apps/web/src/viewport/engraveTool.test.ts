import { addShape, createEmptyDesign, type Design, engravePolygons, setNodeMode, setShapeSize } from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGRAVE, engraveRequest, engraveStart, overhangs } from './engraveTool.ts';

function scene(): Design {
	const d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
	return setShapeSize(d, 'a', { width: 40, depth: 40, height: 20 });
}

describe('engraveStart', () => {
	it('turns a click on the top of a shape into the plane to look at, with the view framed to the shape', () => {
		const start = engraveStart(scene(), { id: 'a', point: [3.123, 4.567, 20], normal: [0, 0, 1] });
		expect('problem' in start).toBe(false);
		if ('problem' in start) return;
		expect(start.id).toBe('a');
		expect(start.frame.origin).toEqual([3.12, 4.57, 20]);
		expect(start.frame.normal).toEqual([0, 0, 1]);
		expect(start.size).toBeGreaterThanOrEqual(60);
		expect(start.size).toBeGreaterThan(40);
	});

	it('takes a side face, whose up is the world up', () => {
		const start = engraveStart(scene(), { id: 'a', point: [20, 0, 10], normal: [1, 0, 0] });
		if ('problem' in start) throw new Error(start.problem);
		expect(start.frame.normal).toEqual([1, 0, 0]);
		expect(start.frame.v[2]).toBeCloseTo(1, 9); // y on the screen is up
	});

	it('says what to click, for the bare floor (no shape)', () => {
		const start = engraveStart(scene(), { point: [0, 0, 0], normal: [0, 0, 1] });
		expect(start).toEqual({ problem: expect.stringMatching(/shape/i) });
	});

	it('says why not for a face pointing down, a shape that is a hole, or one that is locked', () => {
		expect(engraveStart(scene(), { id: 'a', point: [0, 0, 0], normal: [0, 0, -1] })).toEqual({
			problem: expect.stringMatching(/points down/i),
		});
		const hole = setNodeMode(scene(), ['a'], 'hole');
		expect(engraveStart(hole, { id: 'a', point: [0, 0, 20], normal: [0, 0, 1] })).toEqual({ problem: expect.stringMatching(/hole/i) });
		const locked = { ...scene(), nodes: { a: { ...scene().nodes.a!, locked: true } } } as Design;
		expect(engraveStart(locked, { id: 'a', point: [0, 0, 20], normal: [0, 0, 1] })).toEqual({ problem: expect.stringMatching(/locked/i) });
	});
});

describe('engraveRequest', () => {
	const start = () => {
		const s = engraveStart(scene(), { id: 'a', point: [0, 0, 20], normal: [0, 0, 1] });
		if ('problem' in s) throw new Error(s.problem);
		return s;
	};

	it('gives the engine the shape, the frame, the letters’ rings, the depth and the mode', () => {
		const r = engraveRequest(start(), { ...DEFAULT_ENGRAVE, text: 'Hi', depth: 2 });
		if ('problem' in r) throw new Error(r.problem);
		expect(r.targetId).toBe('a');
		expect(r.frame.origin).toEqual([0, 0, 20]);
		expect(r.frame.u).toEqual([1, 0, 0]);
		expect(r.polygons.length).toBeGreaterThan(1);
		expect(r.depth).toBe(2);
		expect(r.mode).toBe('engrave');
	});

	it('names the lettering for the Objects list, by mode, with the words (cut short)', () => {
		const engraved = engraveRequest(start(), { ...DEFAULT_ENGRAVE, text: 'Hi' });
		const raised = engraveRequest(start(), { ...DEFAULT_ENGRAVE, text: 'Hi', mode: 'raised' });
		const long = engraveRequest(start(), { ...DEFAULT_ENGRAVE, text: 'x'.repeat(100) });
		if ('problem' in engraved || 'problem' in raised || 'problem' in long) throw new Error('unexpected');
		expect(engraved.name).toBe('Engraving "Hi"');
		expect(raised.name).toBe('Raised "Hi"');
		expect(long.name.length).toBeLessThanOrEqual(40);
	});

	it('cuts the lettering more finely the smaller the letters are, within limits', () => {
		const res = (em: number) => {
			const r = engraveRequest(start(), { ...DEFAULT_ENGRAVE, em });
			if ('problem' in r) throw new Error(r.problem);
			return r.resolution;
		};
		expect(res(2)).toBe(0.3);
		expect(res(10)).toBeCloseTo(0.5, 9);
		expect(res(200)).toBe(1);
	});

	it('says what is wrong with the depth, the size or the words', () => {
		const bad = (patch: object) => engraveRequest(start(), { ...DEFAULT_ENGRAVE, ...patch });
		expect(bad({ depth: 0 })).toEqual({ problem: expect.stringMatching(/depth/i) });
		expect(bad({ depth: Number.NaN })).toEqual({ problem: expect.stringMatching(/depth/i) });
		expect(bad({ em: 0 })).toEqual({ problem: expect.stringMatching(/size/i) });
		expect(bad({ text: '   ' })).toEqual({ problem: expect.stringMatching(/letters|words/i) });
	});
});

describe('the room the words have', () => {
	const top = (id = 'a') => {
		const s = engraveStart(scene(), { id, point: [0, 0, 20], normal: [0, 0, 1] });
		if ('problem' in s) throw new Error(s.problem);
		return s;
	};

	it('starts as the shape as the plane sees it: how far it reaches each way from where the face was clicked', () => {
		const s = top();
		expect(s.reach.minX).toBeCloseTo(-20, 6);
		expect(s.reach.maxX).toBeCloseTo(20, 6);
		expect(s.reach.minY).toBeCloseTo(-20, 6);
		expect(s.reach.maxY).toBeCloseTo(20, 6);
	});

	it('is measured from the click, not the middle of the shape', () => {
		const s = engraveStart(scene(), { id: 'a', point: [10, 0, 20], normal: [0, 0, 1] });
		if ('problem' in s) throw new Error(s.problem);
		expect(s.reach.minX).toBeCloseTo(-30, 6);
		expect(s.reach.maxX).toBeCloseTo(10, 6);
	});

	it('suggests a letter size that fits the default words on a small face, and not more than the usual 10 mm on a big one', () => {
		const small = addShape(createEmptyDesign('d'), 'cylinder', [0, 0], { id: 'c' }).design; // 20 mm across
		const s = engraveStart(small, { id: 'c', point: [0, 0, 20], normal: [0, 0, 1] });
		if ('problem' in s) throw new Error(s.problem);
		expect(s.em).toBeLessThan(10);
		const words = engravePolygons({ ...DEFAULT_ENGRAVE, em: s.em })!;
		const width = Math.max(...words.flat().map((p) => p[0])) - Math.min(...words.flat().map((p) => p[0]));
		expect(width).toBeLessThanOrEqual(20 * 0.6 + 1e-6);
		expect(top().em).toBe(10);
	});
});

describe('overhang', () => {
	const reach = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
	const ring = (x0: number, x1: number): [number, number][][] => [
		[
			[x0, -1],
			[x1, -1],
			[x1, 1],
			[x0, 1],
		],
	];

	it('is false while the words are within what the shape reaches, even touching its edge', () => {
		expect(overhangs(ring(-5, 5), reach)).toBe(false);
		expect(overhangs(ring(-10, 10), reach)).toBe(false);
	});

	it('is true as soon as they go past it on any side', () => {
		expect(overhangs(ring(-5, 10.5), reach)).toBe(true);
		expect(overhangs(ring(-12, 5), reach)).toBe(true);
		expect(
			overhangs(
				[
					[
						[0, 11],
						[1, 11],
						[1, 12],
					],
				],
				reach,
			),
		).toBe(true);
	});

	it('is false for no words at all', () => {
		expect(overhangs(null, reach)).toBe(false);
	});
});
