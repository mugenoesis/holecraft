import {
	addShape,
	createEmptyDesign,
	type Design,
	engraveInto,
	engravePolygons,
	frameOfPlane,
	type GroupNode,
	groupNodes,
	type ShapeNode,
	setNodeMode,
	setShapeSize,
	transformPoint,
	translation,
} from '@holecraft/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGRAVE, engraveEdit, engraveRequest, engraveStart, overhangs } from './engraveTool.ts';

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

describe('engraveRequest remembers the choices', () => {
	it('carries the settings it was made from, so the engraving can be edited later', () => {
		const s = engraveStart(scene(), { id: 'a', point: [0, 0, 20], normal: [0, 0, 1] });
		if ('problem' in s) throw new Error(s.problem);
		const settings = { ...DEFAULT_ENGRAVE, text: 'Hi', em: 6 };
		const r = engraveRequest(s, settings);
		if ('problem' in r) throw new Error(r.problem);
		expect(r.settings).toEqual(settings);
	});
});

describe('engraveEdit', () => {
	const record = {
		settings: { text: 'Hi', font: 2, em: 6, angle: 15, at: [3, -2] as [number, number], depth: 0.8, mode: 'engrave' as const },
		frame: frameOfPlane({ origin: [0, 0, 20], normal: [0, 0, 1] }),
	};
	const input = { name: 'Engraving "Hi"', ref: 'c'.repeat(64), size: [10, 4, 2] as [number, number, number] };
	const bounds = { min: [-5, -2, 19] as [number, number, number], max: [5, 2, 20.5] as [number, number, number] };
	const engraved = () => engraveInto(scene(), 'a', input, bounds, 'engrave', { id: 'e', groupId: 'g', record }).design;
	const moved = (d: Design, dx: number) => {
		const g = d.nodes.g as GroupNode;
		return { ...d, nodes: { ...d.nodes, g: { ...g, transform: translation(dx, 0, 0) } } } as Design;
	};

	it('opens an engraving with its own choices, on the plane it was placed on, aimed at the group it sits in', () => {
		const out = engraveEdit(engraved(), 'g', 'e');
		if ('problem' in out) throw new Error(out.problem);
		expect(out.settings).toEqual(record.settings);
		expect(out.start.id).toBe('g');
		expect(out.start.frame).toEqual(record.frame);
		expect(out.start.em).toBe(6);
		expect(out.record.frame).toEqual(record.frame);
	});

	it('measures the room the words have from the group without the engraving in it', () => {
		const out = engraveEdit(engraved(), 'g', 'e');
		if ('problem' in out) throw new Error(out.problem);
		expect(out.start.reach.minX).toBeCloseTo(-20, 6);
		expect(out.start.reach.maxX).toBeCloseTo(20, 6);
		expect((out.fitDesign.nodes.e as ShapeNode).hidden).toBe(true);
		expect((engraved().nodes.e as ShapeNode).hidden).toBe(false);
	});

	it('follows a group that has been moved: the plane is where the group is now, and the fitted lettering is brought back into the group’s frame', () => {
		const out = engraveEdit(moved(engraved(), 100), 'g', 'e');
		if ('problem' in out) throw new Error(out.problem);
		expect(out.start.frame.origin).toEqual([100, 0, 20]);
		expect(out.record.frame.origin).toEqual([0, 0, 20]);
		expect(transformPoint(out.into, [100, 0, 20])[0]).toBeCloseTo(0, 9);
	});

	it('says why not for an engraving that is not there, a shape that is not an engraving, or a group that is locked, hidden or inside another', () => {
		const d = engraved();
		expect(engraveEdit(d, 'g', 'nope')).toEqual({ problem: expect.stringMatching(/no longer|not/i) });
		expect(engraveEdit(d, 'g', 'a')).toEqual({ problem: expect.stringMatching(/not an engraving|no engraving/i) });
		const g = d.nodes.g as GroupNode;
		expect(engraveEdit({ ...d, nodes: { ...d.nodes, g: { ...g, locked: true } } }, 'g', 'e')).toEqual({
			problem: expect.stringMatching(/locked/i),
		});
		expect(engraveEdit({ ...d, nodes: { ...d.nodes, g: { ...g, hidden: true } } }, 'g', 'e')).toEqual({
			problem: expect.stringMatching(/hidden/i),
		});
		const nested = groupNodes(addShape(d, 'sphere', [80, 0], { id: 's' }).design, ['g', 's'], { id: 'outer' }).design;
		expect(engraveEdit(nested, 'g', 'e')).toEqual({ problem: expect.stringMatching(/inside|ungroup/i) });
	});
});
