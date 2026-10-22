import { describe, expect, it } from 'vitest';
import type { ShapeNode } from './design.ts';
import { createEmptyDesign } from './design.ts';
import { addShape, shapeBounds } from './ops.ts';
import { setShapeText } from './textShape.ts';
import { MAX_WRAP_SWEEP_DEG, setTextWrap, wrapOf, wrapPoint, wrappedBox } from './textWrap.ts';

const text = (width: number, depth: number, height: number, wrap?: number): ShapeNode =>
	({
		kind: 'shape',
		id: 't',
		name: 'Text 1',
		shapeType: 'text',
		transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
		mode: 'solid',
		color: '#fff',
		hidden: false,
		locked: false,
		params: { width, depth, height, text: 'Hi', font: 1, ...(wrap === undefined ? {} : { wrap }) },
	}) as ShapeNode;

describe('wrapOf', () => {
	it('is 0 (flat) when there is no wrap, or it is 0, or not a number', () => {
		expect(wrapOf(text(40, 10, 3))).toBe(0);
		expect(wrapOf(text(40, 10, 3, 0))).toBe(0);
		expect(wrapOf(text(40, 10, 3, Number.NaN))).toBe(0);
		expect(wrapOf(text(40, 10, 3, Number.POSITIVE_INFINITY))).toBe(0);
	});

	it('is the radius typed, outside (positive) or inside (negative) a cylinder, when the words fit round it', () => {
		expect(wrapOf(text(40, 10, 3, 30))).toBe(30);
		expect(wrapOf(text(40, 10, 3, -30))).toBe(-30);
	});

	it('is never so tight that the words go further round than the limit: a smaller radius is raised to it, keeping its side', () => {
		const least = 40 / ((MAX_WRAP_SWEEP_DEG * Math.PI) / 180);
		expect(wrapOf(text(40, 10, 3, 2))).toBeCloseTo(least, 9);
		expect(wrapOf(text(40, 10, 3, -2))).toBeCloseTo(-least, 9);
	});
});

describe('wrapPoint', () => {
	const R = 20;
	const onCircle = (p: readonly number[], centreZ: number) => Math.hypot(p[0]!, p[2]! - centreZ);

	it('leaves the centre line where it is', () => {
		expect(wrapPoint([0, 7, 0], R)).toEqual([0, 7, 0]);
		const top = wrapPoint([0, -3, 5], R);
		expect(top[0]).toBeCloseTo(0, 12);
		expect(top[1]).toBe(-3);
		expect(top[2]).toBeCloseTo(5, 12);
	});

	it('is the identity for radius 0', () => {
		expect(wrapPoint([4, 5, 6], 0)).toEqual([4, 5, 6]);
	});

	it('outside a cylinder: the base is on the cylinder (axis 20 mm below the centre line), the top is thickness further out, y is kept', () => {
		for (const x of [-30, -10, 5, 25, 60]) {
			expect(onCircle(wrapPoint([x, 1, 0], R), -R)).toBeCloseTo(R, 9);
			expect(onCircle(wrapPoint([x, 1, 3], R), -R)).toBeCloseTo(R + 3, 9);
			expect(wrapPoint([x, 1, 0], R)[1]).toBe(1);
		}
	});

	it('keeps lengths along the base: a quarter turn of arc ends level with the axis, a radius out', () => {
		const q = wrapPoint([(Math.PI * R) / 2, 0, 0], R);
		expect(q[0]).toBeCloseTo(R, 9);
		expect(q[2]).toBeCloseTo(-R, 9);
	});

	it('inside a cylinder: the base is on it (axis 20 mm above the centre line) and the top is thickness nearer the axis', () => {
		for (const x of [-30, -10, 5, 25, 60]) {
			expect(onCircle(wrapPoint([x, 1, 0], -R), R)).toBeCloseTo(R, 9);
			expect(onCircle(wrapPoint([x, 1, 3], -R), R)).toBeCloseTo(R - 3, 9);
		}
	});

	it('curls the ends down outside a cylinder and up inside one', () => {
		expect(wrapPoint([15, 0, 0], R)[2]).toBeLessThan(0);
		expect(wrapPoint([15, 0, 0], -R)[2]).toBeGreaterThan(0);
	});
});

describe('wrappedBox', () => {
	it('is the flat box for a flat shape: centred, standing on z = 0', () => {
		expect(wrappedBox(40, 10, 3, 0)).toEqual({ min: [-20, -5, 0], max: [20, 5, 3] });
	});

	/** The extremes of the bent box found the slow way: bend a fine grid along the base and the top, and take the extremes. */
	const sampled = (w: number, d: number, h: number, r: number) => {
		const min = [Infinity, -d / 2, Infinity];
		const max = [-Infinity, d / 2, -Infinity];
		for (let i = 0; i <= 4000; i++) {
			const x = -w / 2 + (w * i) / 4000;
			for (const z of [0, h]) {
				const p = wrapPoint([x, 0, z], r);
				for (const k of [0, 2]) {
					min[k] = Math.min(min[k]!, p[k]!);
					max[k] = Math.max(max[k]!, p[k]!);
				}
			}
		}
		return { min, max };
	};

	for (const [w, d, h, r] of [
		[40, 10, 3, 60], // a gentle outside curve
		[40, 10, 3, 20], // about a third of the way round
		[60, 10, 3, 14], // more than half way round, so the sides are the widest part
		[60, 10, 3, -14],
		[30, 10, 5, -40],
		[100, 12, 2, 20], // right round to the limit
	] as const) {
		it(`is exactly what bending it gives: ${w} wide, ${h} thick, radius ${r}`, () => {
			const got = wrappedBox(w, d, h, wrapOf(text(w, d, h, r)));
			const want = sampled(w, d, h, wrapOf(text(w, d, h, r)));
			for (const k of [0, 1, 2]) {
				expect(got.min[k]).toBeCloseTo(want.min[k]!, 2);
				expect(got.max[k]).toBeCloseTo(want.max[k]!, 2);
			}
		});
	}
});

describe('shapeBounds of wrapped text', () => {
	it('is the bent box, not the flat one: narrower, with the ends of an outside curve below the base', () => {
		const flat = shapeBounds(text(40, 10, 3));
		const bent = shapeBounds(text(40, 10, 3, 20));
		expect(bent.max[0]! - bent.min[0]!).toBeLessThan(flat.max[0]! - flat.min[0]!);
		expect(bent.min[2]).toBeLessThan(0);
		expect(bent.max[2]).toBeCloseTo(3, 6);
		expect(bent.max[1]! - bent.min[1]!).toBeCloseTo(10, 9);
	});

	it('is unchanged for flat text', () => {
		expect(shapeBounds(text(40, 10, 3, 0))).toEqual(shapeBounds(text(40, 10, 3)));
	});
});

describe('setTextWrap', () => {
	function scene() {
		const added = addShape(createEmptyDesign('d'), 'text', [0, 0], { id: 't' });
		return added.design;
	}
	const wrapOfId = (d: ReturnType<typeof scene>, id = 't') => (d.nodes[id] as ShapeNode).params.wrap;

	it('sets the radius, and 0 takes the wrap off (the setting is dropped, not stored as 0)', () => {
		const wrapped = setTextWrap(scene(), 't', 25);
		expect(wrapOfId(wrapped)).toBe(25);
		const flat = setTextWrap(wrapped, 't', 0);
		expect(flat.nodes.t).toBeDefined();
		expect('wrap' in (flat.nodes.t as ShapeNode).params).toBe(false);
	});

	it('takes a negative radius (inside a cylinder)', () => {
		expect(wrapOfId(setTextWrap(scene(), 't', -25))).toBe(-25);
	});

	it('gives the same design back when nothing changes, and for what it cannot do', () => {
		const d = scene();
		expect(setTextWrap(d, 't', 0)).toBe(d);
		const wrapped = setTextWrap(d, 't', 25);
		expect(setTextWrap(wrapped, 't', 25)).toBe(wrapped);
		expect(setTextWrap(d, 't', Number.NaN)).toBe(d);
		expect(setTextWrap(d, 'nope', 5)).toBe(d);
		const locked = { ...d, nodes: { ...d.nodes, t: { ...d.nodes.t!, locked: true } } };
		expect(setTextWrap(locked, 't', 25)).toBe(locked);
		const box = addShape(d, 'box', [30, 0], { id: 'b' }).design;
		expect(setTextWrap(box, 'b', 25)).toBe(box);
	});

	it('refuses a radius past the size limit either way', () => {
		const d = scene();
		expect(setTextWrap(d, 't', 1e6)).toBe(d);
		expect(setTextWrap(d, 't', -1e6)).toBe(d);
	});

	it('keeps text that rests on the workplane resting on it: an outside curve is lifted by how far its ends dip, and put back when flat', () => {
		const wrapped = setTextWrap(scene(), 't', 20);
		const node = wrapped.nodes.t as ShapeNode;
		expect(shapeBounds(node).min[2]).toBeCloseTo(0, 6);
		expect(node.transform[14]).toBeGreaterThan(0);
		const flat = setTextWrap(wrapped, 't', 0);
		expect(shapeBounds(flat.nodes.t as ShapeNode).min[2]).toBeCloseTo(0, 6);
		expect((flat.nodes.t as ShapeNode).transform[14]).toBeCloseTo(0, 6);
	});

	it('leaves text that is in the air, or tipped up on its edge, where it is', () => {
		const d = scene();
		const t = d.nodes.t as ShapeNode;
		const lifted = { ...d, nodes: { ...d.nodes, t: { ...t, transform: [...t.transform.slice(0, 14), 25, 1] } } } as typeof d;
		const out = setTextWrap(lifted, 't', 20);
		expect((out.nodes.t as ShapeNode).transform[14]).toBe(25);
	});

	it('keeps the wrap when the words change', () => {
		const wrapped = setTextWrap(scene(), 't', 25);
		expect(wrapOfId(setShapeText(wrapped, 't', 'Other words'))).toBe(25);
	});
});
