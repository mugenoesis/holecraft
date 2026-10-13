import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setShapeSize } from './edit.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { hasThreads, parametricShape, setShapeParam, shapeParam, withSimpleThreads } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';
import { ALL_THREAD_SIZES, FITS, IMPERIAL_SIZES, lengthOffset, STANDOFF_TYPES, THREAD_SIZES } from './threadStandards.ts';

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
const bounds = (m: MeshData) => {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, m.positions[i + k]!);
			max[k] = Math.max(max[k]!, m.positions[i + k]!);
		}
	}
	return { min: min.map((v) => Math.round(v * 1e4) / 1e4), max: max.map((v) => Math.round(v * 1e4) / 1e4) };
};

function made(type: 'washer' | 'standoff', settings: Record<string, number> = {}, length?: number) {
	let d = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	for (const [key, value] of Object.entries(settings)) d = setShapeParam(d, 'a', key, value);
	if (length !== undefined) d = setShapeSize(d, 'a', { height: length + lengthOffset(type, (d.nodes.a as ShapeNode).params) });
	return d;
}
const nodeOf = (d: ReturnType<typeof made>) => d.nodes.a as ShapeNode;

/** The thread's mean r^2 over a pitch (crest 1/8, root 1/4, two flanks of 5/16), times pi * length: see threads.test.ts. */
function threadVolume(crest: number, depth: number, length: number): number {
	const root = crest - depth;
	const flank = (crest * crest + crest * root + root * root) / 3;
	return Math.PI * length * ((crest * crest) / 8 + (root * root) / 4 + 2 * (5 / 16) * flank);
}
const depthOf = (pitch: number) => 0.5413 * pitch;
const hexArea = (flats: number) => 2 * Math.sqrt(3) * (flats / 2) ** 2;
/** A circle drawn as 48 sides: 24 r^2 sin(2 pi / 48). */
const disc = (r: number) => 24 * r * r * Math.sin((2 * Math.PI) / 48);

describe('the washer sizes (ISO 7089)', () => {
	it('give the hole, outside diameter and thickness of each size', () => {
		expect(THREAD_SIZES.map((s) => [s.diameter, s.washerInner, s.washerOuter, s.washerThickness])).toEqual([
			[2, 2.2, 5, 0.3],
			[3, 3.2, 7, 0.5],
			[4, 4.3, 9, 0.8],
			[5, 5.3, 10, 1],
			[6, 6.4, 12, 1.6],
			[8, 8.4, 16, 1.6],
			[10, 10.5, 20, 2],
			[12, 13, 24, 2.5],
		]);
	});
});

describe('the inch washer', () => {
	it('starts from a size whose id is its position among the inch sizes, and is as wide as its outside (a 1/4 washer is 0.505 in across)', () => {
		const w = nodeOf(made('washer', { size: 105 }));
		expect([w.params.width, w.params.height]).toEqual([expect.closeTo(12.827, 3), expect.closeTo(1.6256, 3)]);
		expect(IMPERIAL_SIZES).toHaveLength(8);
	});
});

describe('the washer', () => {
	it('has a Size choice only, starts as an M5 (10 mm across, 1 mm thick) and is a solid', () => {
		expect(getShapeDef('washer').name).toBe('Washer');
		expect(getShapeDef('washer').params!.map((p) => p.key)).toEqual(['size']);
		const w = nodeOf(made('washer'));
		expect([w.params.width, w.params.depth, w.params.height]).toEqual([10, 10, 1]);
		expect(w.mode).toBe('solid');
	});

	it('is as wide as its outside, and its standard thickness comes back when the size changes (but can be edited)', () => {
		const m8 = nodeOf(made('washer', { size: 8 }));
		expect([m8.params.width, m8.params.depth, m8.params.height]).toEqual([16, 16, 1.6]);
		expect(nodeOf(made('washer', {}, 3)).params.height).toBe(3);
		const wide = setShapeSize(made('washer'), 'a', { width: 40 });
		expect(nodeOf(wide).params.width).toBe(10); // its diameter is fixed
	});

	for (const size of ALL_THREAD_SIZES) {
		it(`${size.label}: a closed ring facing outwards with the area between its two circles, and nothing in the hole`, () => {
			const mesh = parametricShape(nodeOf(made('washer', { size: size.id })))!;
			expect(isClosed(mesh)).toBe(true);
			const exact = (disc(size.washerOuter / 2) - disc(size.washerInner / 2)) * size.washerThickness;
			expect(signedVolume(mesh)).toBeCloseTo(exact, 3);
			const { min, max } = bounds(mesh);
			expect(max).toEqual([
				expect.closeTo(size.washerOuter / 2, 3),
				expect.closeTo(size.washerOuter / 2, 2),
				expect.closeTo(size.washerThickness, 3),
			]);
			expect(min[2]).toBe(0);
		});
	}

	it('is not a thread: a design with only a washer has nothing for the Simple threads switch to change', () => {
		const d = made('washer');
		expect(hasThreads(d)).toBe(false);
		expect(withSimpleThreads(d)).toBe(d);
		expect(hasThreads(made('standoff'))).toBe(true);
	});
});

describe('the standoff', () => {
	it('has Size, Ends (Female-female to start) and Fit, starts as an M5 hex 10 mm long, and cannot be widened', () => {
		expect(getShapeDef('standoff').name).toBe('Standoff');
		expect(getShapeDef('standoff').params!.map((p) => p.key)).toEqual(['size', 'type', 'fit']);
		expect(STANDOFF_TYPES.map((t) => t.label)).toEqual(['Female-female', 'Male-female']);
		const s = nodeOf(made('standoff'));
		expect(shapeParam(s, 'type')).toBe(1);
		expect([s.params.width, s.params.depth, s.params.height]).toEqual([expect.closeTo(9.237604, 5), 8, 10]);
		expect(nodeOf(setShapeSize(made('standoff'), 'a', { width: 50 })).params.width).toBeCloseTo(9.237604, 5);
	});

	it('a male standoff has a stud (twice the thread’s diameter long) under its body: Length stays the body, the height is both', () => {
		const male = nodeOf(made('standoff', { type: 2 }));
		expect(lengthOffset('standoff', male.params)).toBe(10); // M5: 2 x 5
		expect(male.params.height).toBe(20);
		expect(lengthOffset('standoff', nodeOf(made('standoff')).params)).toBe(0);
		expect(nodeOf(made('standoff', { type: 2, size: 3 }, 12)).params.height).toBe(18); // 12 body + 6 stud
		// changing the type keeps the body length, whichever way
		const back = setShapeParam(made('standoff', { type: 2 }, 15), 'a', 'type', 1);
		expect(nodeOf(back).params.height).toBe(15);
	});

	it('cannot be shorter than it can hold: a female one a nut’s thickness, a male one twice its diameter of body', () => {
		expect(nodeOf(setShapeSize(made('standoff'), 'a', { height: 0.5 })).params.height).toBe(4); // an M5 nut
		const male = setShapeSize(made('standoff', { type: 2 }), 'a', { height: 5 });
		expect(nodeOf(male).params.height).toBe(10 + 10); // 2 x 5 of body above the 10 mm stud
	});

	for (const size of ALL_THREAD_SIZES) {
		it(`${size.label} female: a closed surface facing outwards, a hex prism with the thread cut right through it (volume by hand)`, () => {
			for (const fit of FITS) {
				const length = 3 * size.diameter;
				const mesh = parametricShape(nodeOf(made('standoff', { size: size.id, fit: fit.value }, length)))!;
				expect(isClosed(mesh)).toBe(true);
				const exact = hexArea(size.flats) * length - threadVolume(size.diameter / 2 + fit.clearance, depthOf(size.pitch), length);
				expect(Math.abs(signedVolume(mesh) - exact) / exact).toBeLessThan(0.006);
			}
		});

		it(`${size.label} male: a stud under the body and a blind thread down into it (volume by hand)`, () => {
			const [body, stud] = [4 * size.diameter, 2 * size.diameter];
			const mesh = parametricShape(nodeOf(made('standoff', { size: size.id, type: 2 }, body)))!;
			expect(isClosed(mesh)).toBe(true);
			const hole = body - size.diameter; // the thread goes down to a diameter above the body's bottom
			const exact =
				threadVolume(size.diameter / 2, depthOf(size.pitch), stud) +
				hexArea(size.flats) * body -
				threadVolume(size.diameter / 2 + 0.2, depthOf(size.pitch), hole);
			expect(Math.abs(signedVolume(mesh) - exact) / exact).toBeLessThan(0.006);
			expect(bounds(mesh).max[2]).toBeCloseTo(stud + body, 3);
			expect(bounds(mesh).min[2]).toBe(0);
		});
	}
});
