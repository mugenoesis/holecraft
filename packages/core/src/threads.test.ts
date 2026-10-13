import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setShapeGeometry, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { canResizeGroup } from './groupTransform.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { PARAMETRIC_TYPES, parametricShape, setShapeParam, shapeParam, shapeParamMm } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';
import { ALL_THREAD_SIZES, FITS, IMPERIAL_SIZES, THREAD_SIZES } from './threadStandards.ts';

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

function made(type: 'threaded-rod' | 'threaded-hole', settings: Record<string, number> = {}, length?: number) {
	let design = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design;
	for (const [key, value] of Object.entries(settings)) design = setShapeParam(design, 'a', key, value);
	if (length !== undefined) design = setShapeSize(design, 'a', { height: length });
	return design;
}
const nodeOf = (design: ReturnType<typeof made>) => design.nodes.a as ShapeNode;

/** Distances from the axis of the mesh's points at the angle `deg` (within a hair), with their heights. */
function along(mesh: MeshData, deg: number): { r: number; z: number }[] {
	const out: { r: number; z: number }[] = [];
	for (let i = 0; i < mesh.positions.length; i += 3) {
		const [x, y, z] = [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!];
		const r = Math.hypot(x, y);
		let a = (Math.atan2(y, x) * 180) / Math.PI - deg;
		a = ((a + 540) % 360) - 180;
		if (r > 0.01 && Math.abs(a) < 0.01) out.push({ r, z });
	}
	return out;
}

/**
 * Worked out by hand from the ISO 60-degree profile: over one pitch, the crest is 1/8 wide, the root 1/4, and the two flanks 5/16 each (they
 * fall by the thread's depth). Every angle sees every phase of it, so a cross-section has the same area at any height, pi * mean(r^2).
 */
function meanSquare(crest: number, root: number): number {
	const flank = (crest * crest + crest * root + root * root) / 3;
	return (crest * crest) / 8 + (root * root) / 4 + 2 * (5 / 16) * flank;
}
const depthOf = (pitch: number) => 0.5413 * pitch;

describe('the standard sizes', () => {
	it('are ISO metric M2 to M12 at coarse pitch, and three fits', () => {
		expect(THREAD_SIZES.map((s) => [s.diameter, s.pitch])).toEqual([
			[2, 0.4],
			[3, 0.5],
			[4, 0.7],
			[5, 0.8],
			[6, 1],
			[8, 1.25],
			[10, 1.5],
			[12, 1.75],
		]);
		expect(FITS.map((f) => f.label)).toEqual(['Tight', 'Normal', 'Loose']);
		expect(FITS.map((f) => f.clearance)).toEqual([...FITS.map((f) => f.clearance)].sort((a, b) => a - b));
	});
});

describe('the inch sizes (unified coarse, UNC)', () => {
	it('are #4 to 1/2: the nominal diameter in inches converted to mm, with a pitch of 25.4 over the threads per inch', () => {
		expect(
			IMPERIAL_SIZES.map((s) => [s.id, s.label, Math.round((s.diameter / 25.4) * 1e6) / 1e6, Math.round((25.4 / s.pitch) * 1e6) / 1e6]),
		).toEqual([
			[101, '#4-40 UNC', 0.112, 40],
			[102, '#6-32 UNC', 0.138, 32],
			[103, '#8-32 UNC', 0.164, 32],
			[104, '#10-24 UNC', 0.19, 24],
			[105, '1/4-20 UNC', 0.25, 20],
			[106, '5/16-18 UNC', 0.3125, 18],
			[107, '3/8-16 UNC', 0.375, 16],
			[108, '1/2-13 UNC', 0.5, 13],
		]);
		expect(IMPERIAL_SIZES[4]!.diameter).toBeCloseTo(6.35, 9);
		expect(IMPERIAL_SIZES[4]!.pitch).toBeCloseTo(1.27, 9);
	});

	it('come after the metric ones in the Size choice, in their own group, and metric designs saved before still mean the same size', () => {
		const choices = getShapeDef('threaded-rod').params![0]!.choices!;
		expect(choices.map((c) => c.group)).toEqual([...THREAD_SIZES.map(() => 'Metric'), ...IMPERIAL_SIZES.map(() => 'Inch (UNC)')]);
		expect(choices.map((c) => c.value)).toEqual([2, 3, 4, 5, 6, 8, 10, 12, 101, 102, 103, 104, 105, 106, 107, 108]);
		expect(shapeParam(nodeOf(made('threaded-rod', { size: 105 })), 'size')).toBe(105);
		expect(setShapeParam(made('threaded-rod'), 'a', 'size', 7)).toEqual(made('threaded-rod')); // still no M7
	});

	it('set the footprint of a rod from the inch diameter: a 1/4-20 is 6.35 mm across', () => {
		const rod = nodeOf(made('threaded-rod', { size: 105 }));
		expect([rod.params.width, rod.params.depth]).toEqual([6.35, 6.35]);
	});
});

describe('the threaded shapes', () => {
	it('are built from their settings, with a Size choice (M5 to start); only the hole has a Fit (Normal to start)', () => {
		expect(PARAMETRIC_TYPES).toEqual(expect.arrayContaining(['threaded-rod', 'threaded-hole']));
		const rod = getShapeDef('threaded-rod');
		const hole = getShapeDef('threaded-hole');
		expect([rod.name, hole.name]).toEqual(['Threaded Rod', 'Threaded Hole']);
		expect(rod.params!.map((p) => p.key)).toEqual(['size']);
		expect(hole.params!.map((p) => p.key)).toEqual(['size', 'fit']);
		expect(rod.params![0]!.choices!.map((c) => c.label)).toEqual(ALL_THREAD_SIZES.map((s) => s.label));
		expect(shapeParam(nodeOf(made('threaded-rod')), 'size')).toBe(5);
		expect(shapeParam(nodeOf(made('threaded-hole')), 'fit')).toBe(2);
		expect(nodeOf(made('threaded-hole')).mode).toBe('hole');
		expect(nodeOf(made('threaded-rod')).mode).toBe('solid');
	});

	it('take only the listed choices, and keep what was picked', () => {
		const design = made('threaded-rod');
		expect(shapeParamMm(nodeOf(setShapeParam(design, 'a', 'size', 8)), 'size')).toBe(8);
		expect(setShapeParam(design, 'a', 'size', 7)).toBe(design); // there is no M7
		expect(setShapeParam(design, 'a', 'size', 5)).toBe(design); // already M5
		expect(setShapeParam(made('threaded-hole'), 'a', 'fit', 9).nodes.a).toEqual(made('threaded-hole').nodes.a);
	});

	it('have a footprint set by the size: a rod is its diameter across, a hole is wider by the fit’s clearance on every side', () => {
		const rod = nodeOf(made('threaded-rod', { size: 8 }));
		expect([rod.params.width, rod.params.depth]).toEqual([8, 8]);
		for (const { value: fit, clearance: c } of FITS) {
			const hole = nodeOf(made('threaded-hole', { size: 6, fit }));
			expect(hole.params.width).toBeCloseTo(6 + 2 * c, 9);
			expect(hole.params.depth).toBeCloseTo(6 + 2 * c, 9);
		}
	});

	it('cannot be made wider or deeper, only longer: width and depth are refused by every way of resizing, height is taken', () => {
		const design = made('threaded-rod');
		const before = nodeOf(design).params;
		const wide = setShapeSize(design, 'a', { width: 30, depth: 30 });
		expect([nodeOf(wide).params.width, nodeOf(wide).params.depth]).toEqual([before.width, before.depth]);
		const long = setShapeSize(design, 'a', { width: 30, height: 40 });
		expect(nodeOf(long).params).toMatchObject({ width: before.width, depth: before.depth, height: 40 });
		const dragged = setShapeGeometry(design, 'a', { x: 3, y: 4, z: 0, width: 30, depth: 2, height: 25 });
		expect(nodeOf(dragged).params).toMatchObject({ width: before.width, depth: before.depth, height: 25 });
		expect(dragged.nodes.a).toMatchObject({ transform: expect.arrayContaining([3, 4]) });
	});

	it('stop a group that holds one from being resized (it would stretch the thread)', () => {
		let design = made('threaded-rod');
		design = addShape(design, 'box', [30, 0], { id: 'b' }).design;
		const g = groupNodes(design, ['a', 'b'], { id: 'g' }).design;
		expect(canResizeGroup(g, 'g')).toBe(false);
		const plain = groupNodes(
			addShape(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'x' }).design, 'box', [30, 0], { id: 'y' }).design,
			['x', 'y'],
			{
				id: 'g',
			},
		).design;
		expect(canResizeGroup(plain, 'g')).toBe(true);
	});

	for (const size of ALL_THREAD_SIZES) {
		it(`${size.label}: a closed surface facing outwards, with the volume the ISO profile gives (within the facet error)`, () => {
			const length = 20;
			const mesh = parametricShape(nodeOf(made('threaded-rod', { size: size.id }, length)))!;
			expect(isClosed(mesh)).toBe(true);
			const R = size.diameter / 2;
			const exact = Math.PI * length * meanSquare(R, R - depthOf(size.pitch));
			expect(signedVolume(mesh)).toBeLessThan(exact); // a faceted ring falls a little short
			expect((exact - signedVolume(mesh)) / exact).toBeLessThan(0.004);
		});
	}

	it('keeps its pitch at any length: crests are one pitch apart, and the thread is right-handed (it rises as it turns anticlockwise)', () => {
		const p = 0.8;
		for (const length of [12, 30, 77]) {
			const mesh = parametricShape(nodeOf(made('threaded-rod', {}, length)))!;
			/** The height of the middle of each crest seen at this angle (a crest is a few rows of the surface at full radius). */
			const crests = (deg: number) => {
				const zs = along(mesh, deg)
					.filter((v) => v.r > 2.4999 && v.z > 1e-9 && v.z < length - 1e-9)
					.map((v) => v.z)
					.sort((a, b) => a - b);
				const groups: number[][] = [];
				for (const z of zs) {
					const last = groups[groups.length - 1];
					if (last && z - last[last.length - 1]! < p / 8) last.push(z);
					else groups.push([z]);
				}
				// the first and last crest may be cut short by the ends
				return groups.slice(1, -1).map((g) => (g[0]! + g[g.length - 1]!) / 2);
			};
			const at0 = crests(0);
			expect(at0.length).toBeGreaterThan(Math.floor(length / p) - 2);
			for (let i = 1; i < at0.length; i++) expect(at0[i]! - at0[i - 1]!).toBeCloseTo(p, 4);
			// a quarter turn on, the crest has risen a quarter pitch
			const phase = (z: number) => ((z % p) + p) % p;
			expect(phase(crests(90)[0]!)).toBeCloseTo(p / 4, 4);
			expect(phase(crests(180)[0]!)).toBeCloseTo(p / 2, 4);
		}
	});

	it('stands on z = 0 and is exactly as long as asked, with the crest radius for its size', () => {
		const mesh = parametricShape(nodeOf(made('threaded-rod', { size: 10 }, 33.3)))!;
		let [zMin, zMax, rMax] = [Infinity, -Infinity, 0];
		for (let i = 0; i < mesh.positions.length; i += 3) {
			zMin = Math.min(zMin, mesh.positions[i + 2]!);
			zMax = Math.max(zMax, mesh.positions[i + 2]!);
			rMax = Math.max(rMax, Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!));
		}
		expect(zMin).toBe(0);
		expect(zMax).toBeCloseTo(33.3, 5);
		expect(rMax).toBeCloseTo(5, 5);
	});

	it('a hole is the same thread opened out by the fit on every side, and a looser fit opens it further', () => {
		const rod = parametricShape(nodeOf(made('threaded-rod', {}, 20)))!;
		const radii = (mesh: MeshData) => {
			let max = 0;
			for (let i = 0; i < mesh.positions.length; i += 3) max = Math.max(max, Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!));
			return max;
		};
		const volumes = FITS.map(({ value: fit }) => signedVolume(parametricShape(nodeOf(made('threaded-hole', { fit }, 20)))!));
		for (const { value: fit, clearance } of FITS) {
			const mesh = parametricShape(nodeOf(made('threaded-hole', { fit }, 20)))!;
			expect(radii(mesh)).toBeCloseTo(radii(rod) + clearance, 5);
			expect(isClosed(mesh)).toBe(true);
		}
		expect(volumes[0]).toBeGreaterThan(signedVolume(rod));
		expect(volumes[0]).toBeLessThan(volumes[1]!);
		expect(volumes[1]).toBeLessThan(volumes[2]!);
	});
});
