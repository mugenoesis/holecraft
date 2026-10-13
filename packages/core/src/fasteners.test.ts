import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setShapeSize } from './edit.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { parametricShape, setShapeParam, shapeParam } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';
import { ALL_THREAD_SIZES, FITS, HEADS, IMPERIAL_SIZES, lengthOffset, THREAD_SIZES } from './threadStandards.ts';

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

function made(type: 'bolt' | 'nut', settings: Record<string, number> = {}, length?: number) {
	let design = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	for (const [key, value] of Object.entries(settings)) design = setShapeParam(design, 'a', key, value);
	if (length !== undefined)
		design = setShapeSize(design, 'a', { height: length + lengthOffset(type, (design.nodes.a as ShapeNode).params) });
	return design;
}
const nodeOf = (design: ReturnType<typeof made>) => design.nodes.a as ShapeNode;

/** pi * mean(r^2) of the ISO thread profile over a pitch (crest 1/8, root 1/4, two flanks of 5/16), times the length: see threads.test.ts. */
function threadVolume(crest: number, depth: number, length: number): number {
	const root = crest - depth;
	const flank = (crest * crest + crest * root + root * root) / 3;
	return Math.PI * length * ((crest * crest) / 8 + (root * root) / 4 + 2 * (5 / 16) * flank);
}
const depthOf = (pitch: number) => 0.5413 * pitch;
/** A regular hexagon measured across its flats: 2 * sqrt(3) * (s/2)^2. */
const hexArea = (flats: number) => 2 * Math.sqrt(3) * (flats / 2) ** 2;
/** The 48-sided figure a circle is drawn as: 24 * r^2 * sin(2 pi / 48). */
const discArea = (diameter: number) => 24 * (diameter / 2) ** 2 * Math.sin((2 * Math.PI) / 48);

describe('the standard fastener dimensions (ISO 4017, ISO 4032, ISO 4762)', () => {
	it('give the hex width across flats, head height, nut thickness, and the socket cap head and socket', () => {
		const row = (s: (typeof THREAD_SIZES)[number]) => [
			s.diameter,
			s.flats,
			s.headHeight,
			s.nutHeight,
			s.capDiameter,
			s.socketFlats,
			s.socketDepth,
		];
		expect(THREAD_SIZES.map(row)).toEqual([
			[2, 4, 1.4, 1.6, 3.8, 1.5, 1],
			[3, 5.5, 2, 2.4, 5.5, 2.5, 1.3],
			[4, 7, 2.8, 3.2, 7, 3, 2],
			[5, 8, 3.5, 4, 8.5, 4, 2.5],
			[6, 10, 4, 5, 10, 5, 3],
			[8, 13, 5.3, 6.5, 13, 6, 4],
			[10, 16, 6.4, 8, 16, 8, 5],
			[12, 18, 7.5, 10, 18, 10, 6],
		]);
		expect(HEADS.map((h) => h.label)).toEqual(['Hex', 'Socket cap']);
	});
});

describe('the inch fastener dimensions', () => {
	it('give the nut, hex head, socket cap and washer sizes of each (nominal inches: ASME B18.2.2, B18.6.3, B18.2.1, B18.3, B18.21.1)', () => {
		const inches = (mm: number) => mm / 25.4;
		const rows = IMPERIAL_SIZES.map((s) => [
			s.label.split(' ')[0],
			inches(s.flats),
			inches(s.nutHeight),
			inches(s.headFlats),
			inches(s.headHeight),
			inches(s.capDiameter),
			inches(s.socketFlats),
			inches(s.socketDepth),
			inches(s.washerInner),
			inches(s.washerOuter),
			inches(s.washerThickness),
		]);
		const expected = [
			['#4-40', 0.25, 0.09375, 0.1875, 0.055, 0.183, 0.09375, 0.051, 0.123, 0.248, 0.032],
			['#6-32', 0.3125, 0.109375, 0.25, 0.087, 0.226, 0.109375, 0.064, 0.154, 0.31, 0.032],
			['#8-32', 0.34375, 0.125, 0.25, 0.103, 0.27, 0.140625, 0.077, 0.19, 0.377, 0.04],
			['#10-24', 0.375, 0.125, 0.3125, 0.112, 0.312, 0.15625, 0.09, 0.205, 0.408, 0.04],
			['1/4-20', 0.4375, 0.21875, 0.4375, 0.15625, 0.375, 0.1875, 0.12, 0.286, 0.505, 0.064],
			['5/16-18', 0.5, 0.265625, 0.5, 0.203125, 0.469, 0.25, 0.151, 0.349, 0.63, 0.064],
			['3/8-16', 0.5625, 0.328125, 0.5625, 0.234375, 0.562, 0.3125, 0.182, 0.411, 0.738, 0.064],
			['1/2-13', 0.75, 0.4375, 0.75, 0.3125, 0.75, 0.375, 0.245, 0.536, 1.004, 0.064],
		];
		expect(rows.map((r) => r[0])).toEqual(expected.map((r) => r[0]));
		for (const [i, row] of rows.entries())
			for (const [k, v] of row.entries()) if (k > 0) expect(v as number).toBeCloseTo(expected[i]![k] as number, 4);
	});

	it('a metric bolt head is as wide as its nut, an inch one may be narrower (a #4 head is 3/16, its nut 1/4)', () => {
		for (const s of THREAD_SIZES) expect(s.headFlats).toBe(s.flats);
		expect(IMPERIAL_SIZES[0]!.headFlats).toBeLessThan(IMPERIAL_SIZES[0]!.flats);
		const bolt = nodeOf(made('bolt', { size: 101 }));
		expect(bolt.params.depth).toBeCloseTo(4.7625, 4); // 3/16 across flats
		expect(nodeOf(made('nut', { size: 101 })).params.depth).toBeCloseTo(6.35, 4); // 1/4
	});
});

describe('the bolt and the nut', () => {
	it('are built from their settings: a bolt has Size and Head, a nut Size and Fit, and neither starts as a hole', () => {
		expect(getShapeDef('bolt').params!.map((p) => p.key)).toEqual(['size', 'head']);
		expect(getShapeDef('nut').params!.map((p) => p.key)).toEqual(['size', 'fit']);
		expect([getShapeDef('bolt').name, getShapeDef('nut').name]).toEqual(['Bolt', 'Nut']);
		expect([nodeOf(made('bolt')).mode, nodeOf(made('nut')).mode]).toEqual(['solid', 'solid']);
		expect(shapeParam(nodeOf(made('bolt')), 'head')).toBe(1);
		expect(shapeParam(nodeOf(made('nut')), 'fit')).toBe(2);
	});

	it('have a footprint set by the head or the nut: a hex is measured across corners by across flats, a socket cap is round', () => {
		const corners = (flats: number) => flats / Math.cos(Math.PI / 6);
		let bolt = nodeOf(made('bolt'));
		expect([bolt.params.width, bolt.params.depth]).toEqual([expect.closeTo(corners(8), 5), 8]);
		bolt = nodeOf(made('bolt', { head: 2 }));
		expect([bolt.params.width, bolt.params.depth]).toEqual([8.5, 8.5]);
		const nut = nodeOf(made('nut', { size: 10 }));
		expect([nut.params.width, nut.params.depth]).toEqual([expect.closeTo(corners(16), 5), 16]);
		for (const { value: fit } of FITS) expect(nodeOf(made('nut', { fit })).params.depth).toBe(8); // the fit opens the thread, not the outside
	});

	it('a bolt’s Length is its shank without the head: the height is the head on top of it, and a head or size change keeps the shank', () => {
		expect(nodeOf(made('bolt')).params.height).toBeCloseTo(20 + 3.5, 9);
		expect(lengthOffset('bolt', nodeOf(made('bolt')).params)).toBeCloseTo(3.5, 9);
		expect(lengthOffset('nut', nodeOf(made('nut')).params)).toBe(0);
		expect(lengthOffset('threaded-rod', {})).toBe(0);
		const socket = nodeOf(made('bolt', { head: 2 })); // a socket cap is as tall as the bolt is wide: 5 mm
		expect(socket.params.height).toBeCloseTo(20 + 5, 9);
		const m8 = nodeOf(made('bolt', { size: 8 })); // a 5.3 mm hex head
		expect(m8.params.height).toBeCloseTo(20 + 5.3, 9);
		expect(nodeOf(made('bolt', { size: 8, head: 2 }, 35)).params.height).toBeCloseTo(35 + 8, 9);
	});

	it('a nut is the standard thickness for its size, which a size change resets, and a longer or shorter one can be made', () => {
		expect(nodeOf(made('nut')).params.height).toBe(4);
		expect(nodeOf(made('nut', { size: 8 })).params.height).toBe(6.5);
		expect(nodeOf(made('nut', {}, 12)).params.height).toBe(12);
	});

	it('cannot be made shorter than a head and a pitch of shank', () => {
		const bolt = setShapeSize(made('bolt'), 'a', { height: 1 });
		expect(nodeOf(bolt).params.height).toBeCloseTo(3.5 + 0.8, 9);
	});

	for (const size of ALL_THREAD_SIZES) {
		for (const head of HEADS) {
			it(`${size.label} bolt with a ${head.label} head: a closed surface facing outwards with the volume worked out by hand`, () => {
				const length = 15;
				const mesh = parametricShape(nodeOf(made('bolt', { size: size.id, head: head.value }, length)))!;
				expect(isClosed(mesh)).toBe(true);
				const shank = threadVolume(size.diameter / 2, depthOf(size.pitch), length);
				const headVolume =
					head.value === 1
						? hexArea(size.headFlats) * size.headHeight
						: discArea(size.capDiameter) * size.diameter - hexArea(size.socketFlats) * size.socketDepth;
				const exact = shank + headVolume;
				expect(Math.abs(signedVolume(mesh) - exact) / exact).toBeLessThan(0.004);
				const { min, max } = bounds(mesh);
				expect(min[2]).toBe(0);
				expect(max[2]).toBeCloseTo(length + (head.value === 1 ? size.headHeight : size.diameter), 3);
			});
		}

		it(`${size.label} nut: a closed surface facing outwards, a hex prism with the thread cut through it (the volume by hand)`, () => {
			for (const fit of FITS) {
				const mesh = parametricShape(nodeOf(made('nut', { size: size.id, fit: fit.value })))!;
				expect(isClosed(mesh)).toBe(true);
				const cutter = threadVolume(size.diameter / 2 + fit.clearance, depthOf(size.pitch), size.nutHeight);
				const exact = hexArea(size.flats) * size.nutHeight - cutter;
				expect(Math.abs(signedVolume(mesh) - exact) / exact).toBeLessThan(0.006);
			}
		});
	}

	it('a nut’s hex has its corners on the x axis and fills its box (the same left to right)', () => {
		const { min, max } = bounds(parametricShape(nodeOf(made('nut')))!);
		expect(max).toEqual([expect.closeTo(8 / Math.cos(Math.PI / 6) / 2, 4), 4, 4]);
		expect(min).toEqual([expect.closeTo(-8 / Math.cos(Math.PI / 6) / 2, 4), -4, 0]);
	});

	it('a socket cap has a hex socket in its top: the middle of the top is lower than its rim', () => {
		const mesh = parametricShape(nodeOf(made('bolt', { head: 2 }, 15)))!;
		const zs = new Set<number>();
		for (let i = 0; i < mesh.positions.length; i += 3)
			if (Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!) < 0.1) zs.add(Math.round(mesh.positions[i + 2]! * 1e4) / 1e4);
		expect([...zs].sort((a, b) => a - b)).toEqual([0, 15 + 5 - 2.5]); // the shank's tip and the socket's floor (4 mm across flats, 2.5 deep)
	});
});
