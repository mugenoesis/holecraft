import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import type { PaintFill } from './design.ts';
import type { MeshData } from './meshShape.ts';
import { paintTriangles } from './paintRegions.ts';

/** A box from (0,0,0) to (w,d,h): 8 shared corners, 12 triangles, outward. */
function box(w: number, d: number, h: number): MeshData {
	const p = [0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h];
	const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
	return { positions: new Float32Array(p), indices: new Uint32Array(i) };
}
const corners = (m: MeshData, t: number) => [0, 1, 2].map((k) => [0, 1, 2].map((a) => m.positions[m.indices[t * 3 + k]! * 3 + a]!));
const triangleCount = (m: MeshData) => m.indices.length / 3;
const area = (m: MeshData, t: number) => {
	const c = corners(m, t);
	const u = [0, 1, 2].map((a) => c[1]![a]! - c[0]![a]!);
	const v = [0, 1, 2].map((a) => c[2]![a]! - c[0]![a]!);
	return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
};
const totalArea = (m: MeshData) => Array.from({ length: triangleCount(m) }, (_, t) => area(m, t)).reduce((a, b) => a + b, 0);
const volume = (m: MeshData) => {
	let sum = 0;
	for (let t = 0; t < triangleCount(m); t++) {
		const [a, b, c] = corners(m, t) as [number[], number[], number[]];
		sum +=
			(a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
	}
	return sum;
};
/** True when every edge is shared by exactly two triangles, running opposite ways (a closed surface with no cracks or T-junctions). */
function watertight(m: MeshData): boolean {
	const key = (p: number[]) => p.map((v) => Math.round(v * 1e4)).join(',');
	const seen = new Map<string, number>();
	for (let t = 0; t < triangleCount(m); t++) {
		const c = corners(m, t).map(key);
		for (let k = 0; k < 3; k++) {
			const e = `${c[k]}>${c[(k + 1) % 3]}`;
			seen.set(e, (seen.get(e) ?? 0) + 1);
		}
	}
	for (const [e, n] of seen) {
		const [a, b] = e.split('>');
		if (n !== 1 || seen.get(`${b}>${a}`) !== 1) return false;
	}
	return true;
}
type Painted = NonNullable<ReturnType<typeof paintTriangles>>;
const meshOf = (out: Painted, fallback: MeshData) => out.mesh ?? fallback;
const paintedArea = (out: Painted, fallback: MeshData, which?: number) => {
	const m = meshOf(out, fallback);
	let sum = 0;
	for (let t = 0; t < out.triangle.length; t++)
		if (which === undefined ? out.triangle[t] !== 0 : out.triangle[t] === which) sum += area(m, t);
	return sum;
};

const RED = '#ff0000';
const BLUE = '#0000ff';
const GREEN = '#00ff00';
const band = (color: string | null, origin: Vec3, up: Vec3, height: number, id = 'h'): PaintFill => ({
	id,
	kind: 'band',
	color,
	origin,
	up,
	height,
});
const gaps = (areaMm2: number, id = 'g'): PaintFill => ({ id, kind: 'gaps', color: null, area: areaMm2 });
const region = (color: string, point: Vec3, normal: Vec3, id = 'r'): PaintFill => ({ id, kind: 'region', color, point, normal });
const sphere = (color: string | null, point: Vec3, radius: number, id = 's'): PaintFill => ({
	id,
	kind: 'brush',
	color,
	shape: 'sphere',
	radius,
	dabs: [{ point, normal: [0, 0, 1] }],
});
const UP: Vec3 = [0, 0, 1];

describe('height range bands', () => {
	it('paint a strip right round the walls: 3 mm up a 20 mm box is 4 walls of 20 x 3, and the top and bottom are left alone', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [band(RED, [10, 10, 5], UP, 3)])!;
		expect(paintedArea(out, m)).toBeCloseTo(240, 4);
		expect(out.colors).toEqual([RED]);
	});

	it('cut the surface along the band’s two planes (straight edges) and keep it closed, with the same area and volume', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [band(RED, [10, 10, 5], UP, 3)])!;
		expect(out.mesh).toBeDefined();
		expect(watertight(out.mesh!)).toBe(true);
		expect(totalArea(out.mesh!)).toBeCloseTo(2400, 3);
		expect(volume(out.mesh!)).toBeCloseTo(8000, 3);
		for (let t = 0; t < out.triangle.length; t++) {
			const zs = corners(out.mesh!, t).map((p) => p[2]!);
			const inside = zs.every((z) => z >= 5 - 1e-6 && z <= 8 + 1e-6);
			const outside = zs.every((z) => z <= 5 + 1e-6 || z >= 8 - 1e-6);
			expect(inside || outside, `triangle ${t} crosses a band plane`).toBe(true);
			if (out.triangle[t] !== 0 && corners(out.mesh!, t).some((p) => p[0] === 0 || p[0] === 20 || p[1] === 0 || p[1] === 20))
				expect(inside).toBe(true);
		}
	});

	it('include a face lying inside the band: 18 to 22 mm is the whole top (400) and 2 mm of the walls (160)', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [band(RED, [10, 10, 18], UP, 4)])!;
		expect(paintedArea(out, m)).toBeCloseTo(560, 4);
	});

	it('include a face on the band’s edge', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [band(RED, [10, 10, 20], UP, 5)])!;
		expect(paintedArea(out, m)).toBeCloseTo(400, 4); // the top, and no wall (the walls end at 20)
		const low = paintTriangles(m, [band(RED, [10, 10, 0], UP, 2)])!;
		expect(paintedArea(low, m)).toBeCloseTo(400 + 4 * 20 * 2, 4); // the bottom face is at 0, the start of the band
	});

	it('go along any direction: across x, a strip of 2 mm is 2 x 20 on the top, the bottom and the two side walls', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [band(BLUE, [6, 0, 0], [1, 0, 0], 2)])!;
		expect(paintedArea(out, m)).toBeCloseTo(4 * 2 * 20, 4);
		expect(watertight(out.mesh!)).toBe(true);
	});

	it('paint nothing, and cut nothing, where the band misses the shape', () => {
		expect(paintTriangles(box(20, 20, 20), [band(RED, [10, 10, 50], UP, 3)])).toBeNull();
	});

	it('erase with no colour, and later fills go over earlier ones', () => {
		const m = box(20, 20, 20);
		const bands = [band(RED, [10, 10, 5], UP, 6, 'a'), band(null, [10, 10, 7], UP, 2, 'b')];
		const out = paintTriangles(m, bands)!;
		expect(paintedArea(out, m)).toBeCloseTo(4 * 20 * 4, 4); // 5 to 7 and 9 to 11 stay red: 2 + 2 mm of wall
		const over = paintTriangles(m, [band(RED, [10, 10, 5], UP, 3, 'a'), band(BLUE, [10, 10, 6], UP, 3, 'b')])!;
		expect(over.colors).toEqual([RED, BLUE]);
		expect(paintedArea(over, m, 1)).toBeCloseTo(4 * 20 * 1, 4);
		expect(paintedArea(over, m, 2)).toBeCloseTo(4 * 20 * 3, 4);
	});

	it('work together with a brush on the same mesh, still closed', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [band(RED, [10, 10, 5], UP, 3, 'a'), sphere(BLUE, [10, 10, 20], 3, 'b')])!;
		expect(watertight(out.mesh!)).toBe(true);
		expect(totalArea(out.mesh!)).toBeCloseTo(2400, 3);
		expect(paintedArea(out, m, 1)).toBeCloseTo(240, 3);
	});
});

describe('gap fills', () => {
	/** The top of a 20 mm box painted red as a 6 mm disc, with a 0.5 mm speck of it erased from the middle. */
	const speckled = (...after: PaintFill[]) => [sphere(RED, [10, 10, 20], 6, 'disc'), sphere(null, [10, 10, 20], 0.5, 'speck'), ...after];

	it('merge a small unpainted speck inside the paint into it: the disc is whole again', () => {
		const m = box(20, 20, 20);
		const before = paintTriangles(m, speckled())!;
		const after = paintTriangles(m, speckled(gaps(2)))!;
		expect(paintedArea(after, m)).toBeGreaterThan(paintedArea(before, m) + 0.5);
		expect(paintedArea(after, m)).toBeGreaterThan(Math.PI * 36 * 0.9);
		expect(paintedArea(after, m)).toBeLessThan(Math.PI * 36 * 1.1);
	});

	it('leave a patch alone when it is bigger than the area, and do nothing at 0', () => {
		const m = box(20, 20, 20);
		const before = paintTriangles(m, speckled())!;
		for (const small of [0, 0.3]) {
			const out = paintTriangles(m, speckled(gaps(small)))!;
			expect(paintedArea(out, m)).toBeCloseTo(paintedArea(before, m), 6);
		}
	});

	it('merge a small painted speck away into the unpainted surface around it, leaving nothing painted', () => {
		const m = box(20, 20, 20);
		expect(paintTriangles(m, [sphere(RED, [10, 10, 20], 0.6), gaps(5)])).toBeNull();
		expect(paintTriangles(m, [sphere(RED, [10, 10, 20], 0.6)])).not.toBeNull();
	});

	it('never merges the whole surface into nothing: a single patch has no neighbour to join', () => {
		const m = box(2, 2, 2);
		const out = paintTriangles(m, [{ id: 'b', kind: 'body', color: RED }, gaps(1000)])!;
		expect(paintedArea(out, m)).toBeCloseTo(24, 6);
	});

	it('join the neighbour it shares the most edge with: a speck mostly on the top becomes the top’s colour, mostly on the side the side’s', () => {
		const m = box(20, 20, 20);
		const paint = (dab: Vec3) => [
			region(BLUE, [10, 10, 20], UP, 'top'),
			region(GREEN, [20, 10, 10], [1, 0, 0], 'side'),
			sphere(RED, dab, 1, 'speck'),
			gaps(10),
		];
		const areaOf = (out: Painted, colour: string) => paintedArea(out, m, out.colors.indexOf(colour) + 1);
		// the speck lies across the edge, so what it covered on the other face goes with it: the whole patch joins one colour
		const onTop = paintTriangles(m, paint([19.4, 10, 20]))!;
		expect(onTop.colors).not.toContain(RED);
		expect(areaOf(onTop, BLUE)).toBeGreaterThan(400);
		expect(areaOf(onTop, GREEN)).toBeLessThan(400);
		const onSide = paintTriangles(m, paint([20, 10, 19.4]))!;
		expect(onSide.colors).not.toContain(RED);
		expect(areaOf(onSide, GREEN)).toBeGreaterThan(400);
		expect(areaOf(onSide, BLUE)).toBeLessThan(400);
	});

	it('do not join one small patch to another small one (they would only swap): two specks side by side both join the large unpainted surface', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [sphere(RED, [10, 10, 20], 0.6, 'a'), sphere(BLUE, [11.1, 10, 20], 0.6, 'b'), gaps(5)]);
		// each is a fragment next to the other and to the unpainted top: the unpainted top is the neighbour both can join
		expect(out).toBeNull();
	});

	it('go on until nothing is left to join: a small speck inside a small ring ends up in the surface round them both', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [
			region(BLUE, [10, 10, 20], UP, 'top'),
			sphere(GREEN, [10, 10, 20], 1, 'ring'),
			sphere(RED, [10, 10, 20], 0.6, 'speck'),
			gaps(5),
		])!;
		expect(out.colors).toEqual([BLUE]);
		expect(paintedArea(out, m)).toBeCloseTo(400, 3);
	});

	it('leave things as they are when every patch is small, rather than swapping them with each other', () => {
		const m = box(2, 2, 2);
		const out = paintTriangles(m, [region(RED, [1, 1, 2], UP, 'a'), region(GREEN, [2, 1, 1], [1, 0, 0], 'b'), gaps(1000)])!;
		expect(paintedArea(out, m, out.colors.indexOf(RED) + 1)).toBeCloseTo(4, 6); // the top stays red, a side stays green, the rest unpainted
		expect(paintedArea(out, m, out.colors.indexOf(GREEN) + 1)).toBeCloseTo(4, 6);
	});

	it('only tidy what was laid before it, so paint added after stays', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [gaps(5), sphere(RED, [10, 10, 20], 0.6)])!;
		expect(paintedArea(out, m)).toBeGreaterThan(0.5);
	});
});
