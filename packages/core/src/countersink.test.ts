import { describe, expect, it } from 'vitest';
import { countersinkOf, countersunkMesh, setShapeCountersink } from './countersink.ts';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setNodeMode } from './edit.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { setLocked } from './visibility.ts';

/** A cylinder 6 mm wide and deep, 20 mm tall, as a hole (or solid) with the given extra params. */
function cylinder(params: Record<string, unknown> = {}, mode: 'hole' | 'solid' = 'hole'): ShapeNode {
	const base = addShape(createEmptyDesign('d'), 'cylinder', [0, 0], { id: 'a' }).design;
	const design = setNodeMode(base, ['a'], mode);
	const node = design.nodes.a as ShapeNode;
	return { ...node, params: { ...node.params, width: 6, depth: 6, height: 20, ...params } };
}

const start = () => setNodeMode(addShape(createEmptyDesign('d'), 'cylinder', [0, 0], { id: 'a' }).design, ['a'], 'hole');
const paramsOf = (d: ReturnType<typeof start>) => (d.nodes.a as ShapeNode).params;

describe('countersinkOf', () => {
	it('is the typed size and end for a cylinder hole, and the top by default', () => {
		expect(countersinkOf(cylinder({ countersink: 3 }))).toEqual({ size: 3, end: 'top' });
		expect(countersinkOf(cylinder({ countersink: 3, countersinkEnd: 'both' }))).toEqual({ size: 3, end: 'both' });
	});

	it('is nothing without a size, for solids, and for other shapes', () => {
		expect(countersinkOf(cylinder())).toBeNull();
		expect(countersinkOf(cylinder({ countersink: 0 }))).toBeNull();
		expect(countersinkOf(cylinder({ countersink: 3 }, 'solid'))).toBeNull();
		expect(countersinkOf({ ...cylinder({ countersink: 3 }), shapeType: 'box' })).toBeNull();
	});

	it('is limited so the flare never passes the hole’s own length (half of it when both ends flare)', () => {
		expect(countersinkOf(cylinder({ countersink: 50 }))!.size).toBe(20);
		expect(countersinkOf(cylinder({ countersink: 50, countersinkEnd: 'both' }))!.size).toBe(10);
	});

	it('ignores an end it does not know', () => {
		expect(countersinkOf(cylinder({ countersink: 3, countersinkEnd: 'sideways' }))!.end).toBe('top');
	});
});

describe('setShapeCountersink', () => {
	it('stores the size as typed and the end', () => {
		const d = setShapeCountersink(setShapeCountersink(start(), 'a', { size: 3 }), 'a', { end: 'bottom' });
		expect(paramsOf(d)).toMatchObject({ countersink: 3, countersinkEnd: 'bottom' });
	});

	it('size 0 removes the countersink and its end', () => {
		const d = setShapeCountersink(setShapeCountersink(start(), 'a', { size: 3, end: 'both' }), 'a', { size: 0 });
		expect(paramsOf(d).countersink).toBeUndefined();
		expect(paramsOf(d).countersinkEnd).toBeUndefined();
	});

	it('returns the same design when nothing changes, and refuses bad input, locked shapes and other shapes', () => {
		const d = setShapeCountersink(start(), 'a', { size: 3 });
		expect(setShapeCountersink(d, 'a', { size: 3 })).toBe(d);
		// the same design object comes back (comparing two designs built separately would differ by their timestamps)
		const base = start();
		expect(setShapeCountersink(base, 'a', { size: 0 })).toBe(base);
		expect(setShapeCountersink(base, 'a', { size: -1 })).toBe(base);
		expect(setShapeCountersink(base, 'a', { size: Number.NaN })).toBe(base);
		expect(setShapeCountersink(base, 'a', { end: 'sideways' as never })).toBe(base);
		const locked = setLocked(start(), ['a'], true);
		expect(setShapeCountersink(locked, 'a', { size: 3 })).toBe(locked);
		const box = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		expect(setShapeCountersink(box, 'b', { size: 3 })).toBe(box);
	});
});

describe('countersunkMesh', () => {
	const N = 64;
	/** Area of an N-sided polygon inscribed in an ellipse with semi-axes a and b. */
	const area = (a: number, b: number) => (N / 2) * a * b * Math.sin((2 * Math.PI) / N);
	/** Volume of a flare from semi-axes (a, b) growing by t (0 to s) over height s: the integral of area(a + t, b + t) dt, worked out by hand. */
	const flare = (a: number, b: number, s: number) =>
		(N / 2) * Math.sin((2 * Math.PI) / N) * (a * b * s + ((a + b) * s * s) / 2 + (s * s * s) / 3);

	it('is a plain cylinder plus one flare at the top: volume checked against the hand-worked integral', () => {
		const [w, d, h, s] = [6, 8, 20, 3];
		const mesh = countersunkMesh(w, d, h, s, 'top', N);
		expect(signedVolume(mesh)).toBeCloseTo(area(w / 2, d / 2) * (h - s) + flare(w / 2, d / 2, s), 3);
	});

	it('flares the bottom, or both ends, by the same amount', () => {
		const [w, d, h, s] = [6, 6, 20, 3];
		const one = area(3, 3) * (h - s) + flare(3, 3, s);
		expect(signedVolume(countersunkMesh(w, d, h, s, 'bottom', N))).toBeCloseTo(one, 3);
		expect(signedVolume(countersunkMesh(w, d, h, s, 'both', N))).toBeCloseTo(area(3, 3) * (h - 2 * s) + 2 * flare(3, 3, s), 3);
	});

	it('the flare opens out by exactly the size at the end it is on', () => {
		/** The widest point (distance from the axis along x) of the ring at height z. */
		const radiusAt = (m: { positions: Float32Array }, z: number) => {
			let r = 0;
			for (let v = 0; v < m.positions.length; v += 3) if (m.positions[v + 2] === z) r = Math.max(r, Math.abs(m.positions[v]!));
			return r;
		};
		const top = countersunkMesh(6, 6, 20, 4, 'top', N);
		expect([radiusAt(top, 0), radiusAt(top, 20)]).toEqual([3, 7]);
		const bottom = countersunkMesh(6, 6, 20, 4, 'bottom', N);
		expect([radiusAt(bottom, 0), radiusAt(bottom, 20)]).toEqual([7, 3]);
	});

	it('a flare as long as the hole is a plain cone: no zero-height slices, still a closed solid', () => {
		const mesh = countersunkMesh(6, 6, 4, 4, 'top', N);
		expect(signedVolume(mesh)).toBeCloseTo(flare(3, 3, 4), 3);
	});
});
