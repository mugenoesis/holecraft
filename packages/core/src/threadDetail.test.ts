import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { hasThreads, parametricShape, setShapeParam, withSimpleThreads } from './parametricShapes.ts';
import { THREAD_SIZES } from './threadStandards.ts';

function isClosed(mesh: MeshData): boolean {
	const seen = new Map<string, number>();
	for (let t = 0; t < mesh.indices.length; t += 3) {
		for (let k = 0; k < 3; k++) {
			const key = `${mesh.indices[t + k]},${mesh.indices[t + ((k + 1) % 3)]}`;
			seen.set(key, (seen.get(key) ?? 0) + 1);
		}
	}
	return [...seen].every(([key, n]) => n === 1 && seen.get(key.split(',').reverse().join(',')) === 1);
}

const TYPES = ['threaded-rod', 'threaded-hole', 'bolt', 'nut'] as const;

function made(type: (typeof TYPES)[number], size: number, height: number) {
	let d = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	d = setShapeParam(d, 'a', 'size', size);
	return setShapeSize(d, 'a', { height });
}
const nodeOf = (d: ReturnType<typeof made>) => d.nodes.a as ShapeNode;
const rMax = (m: MeshData, zLo: number, zHi: number) => {
	let r = 0;
	for (let i = 0; i < m.positions.length; i += 3)
		if (m.positions[i + 2]! >= zLo && m.positions[i + 2]! <= zHi) r = Math.max(r, Math.hypot(m.positions[i]!, m.positions[i + 1]!));
	return r;
};

describe('the simple thread detail', () => {
	it('marks every threaded shape (and no other) and leaves the design alone: the same design back when there is nothing to mark', () => {
		let d = made('bolt', 5, 40);
		d = addShape(d, 'box', [30, 0], { id: 'b' }).design;
		const simple = withSimpleThreads(d);
		expect((simple.nodes.a as ShapeNode).params.simple).toBe(1);
		expect((simple.nodes.b as ShapeNode).params.simple).toBeUndefined();
		expect((d.nodes.a as ShapeNode).params.simple).toBeUndefined(); // the design itself is not changed
		const plain = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		expect(withSimpleThreads(plain)).toBe(plain);
		expect(hasThreads(plain)).toBe(false);
		expect(hasThreads(d)).toBe(true);
	});

	it('reaches a thread inside a group', () => {
		let d = made('threaded-rod', 5, 20);
		d = addShape(d, 'box', [30, 0], { id: 'b' }).design;
		const g = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		expect((withSimpleThreads(g).nodes.a as ShapeNode).params.simple).toBe(1);
	});

	for (const type of TYPES) {
		it(`${type}: a plain cylinder for the thread, tiny beside the real one, closed and facing outwards, the same length and head`, () => {
			const real = made(type, 12, 100);
			const simple = withSimpleThreads(real);
			const [r, s] = [parametricShape(nodeOf(real))!, parametricShape(nodeOf(simple))!];
			expect(isClosed(s)).toBe(true);
			expect(signedVolume(s)).toBeGreaterThan(0);
			expect(s.indices.length / 3).toBeLessThan(r.indices.length / 3 / 50);
			expect(s.indices.length / 3).toBeLessThan(1000);
			const heights = (m: MeshData) => {
				let [lo, hi] = [Infinity, -Infinity];
				for (let i = 2; i < m.positions.length; i += 3) [lo, hi] = [Math.min(lo, m.positions[i]!), Math.max(hi, m.positions[i]!)];
				return [lo, hi];
			};
			expect(heights(s)).toEqual(heights(r));
		});
	}

	it('is a cylinder at the pitch diameter: between the thread’s root and crest, so its volume is too', () => {
		for (const size of THREAD_SIZES) {
			const real = made('threaded-rod', size.diameter, 30);
			const [rm, sm] = [parametricShape(nodeOf(real))!, parametricShape(nodeOf(withSimpleThreads(real)))!];
			const crest = size.diameter / 2;
			const root = crest - 0.5413 * size.pitch;
			const pitchRadius = rMax(sm, 0, 30);
			expect(pitchRadius).toBeCloseTo(crest - (0.6495 * size.pitch) / 2, 3); // the pitch diameter of an ISO thread: d - 0.6495 p
			expect(pitchRadius).toBeGreaterThan(root);
			expect(pitchRadius).toBeLessThan(crest);
			// within a few percent of the real volume, so what you see is about what you will print
			expect(Math.abs(signedVolume(sm) - signedVolume(rm)) / signedVolume(rm)).toBeLessThan(0.06);
		}
	});

	it('keeps a bolt’s head and a nut’s hex exactly as they are, and a hole or nut thread opened by its fit', () => {
		const bolt = made('bolt', 8, 45);
		const [a, b] = [parametricShape(nodeOf(bolt))!, parametricShape(nodeOf(withSimpleThreads(bolt)))!];
		const headRadius = (m: MeshData) => rMax(m, 45 - 5.3 + 1e-6, 45);
		expect(headRadius(b)).toBeCloseTo(headRadius(a), 6);
		const hole = made('threaded-hole', 8, 20);
		const [crestHole, simpleHole] = [
			rMax(parametricShape(nodeOf(hole))!, 0, 20),
			rMax(parametricShape(nodeOf(withSimpleThreads(hole)))!, 0, 20),
		];
		expect(simpleHole).toBeLessThan(crestHole);
		expect(simpleHole).toBeCloseTo(4 - (0.6495 * 1.25) / 2 + 0.2, 3); // the screw's pitch radius, opened by the Normal fit's 0.2 mm
	});
});
