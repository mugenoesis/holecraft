import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import type { BrushDab, BrushShape, PaintFill } from './design.ts';
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
const paintedArea = (m: MeshData, tri: Uint16Array, which?: number) => {
	let sum = 0;
	for (let t = 0; t < tri.length; t++) if (which === undefined ? tri[t] !== 0 : tri[t] === which) sum += area(m, t);
	return sum;
};
const dab = (point: Vec3, normal: Vec3 = [0, 0, 1]): BrushDab => ({ point, normal });
const brush = (shape: BrushShape, radius: number, dabs: BrushDab[], color: string | null = '#ff0000', id = 'b'): PaintFill => ({
	id,
	kind: 'brush',
	color,
	shape,
	radius,
	dabs,
});
const RED = '#ff0000';
const BLUE = '#0000ff';

describe('brush paint', () => {
	it('cuts the surface finer under the brush and keeps it a closed surface with the same area and volume', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [brush('sphere', 3, [dab([10, 10, 20])])])!;
		expect(out.mesh).toBeDefined();
		expect(triangleCount(out.mesh!)).toBeGreaterThan(12);
		expect(out.triangle).toHaveLength(triangleCount(out.mesh!));
		expect(watertight(out.mesh!)).toBe(true);
		expect(totalArea(out.mesh!)).toBeCloseTo(2400, 3);
		expect(volume(out.mesh!)).toBeCloseTo(8000, 3);
	});

	it('paints a disc: a 3 mm brush on a flat face covers about pi r squared, following the brush’s edge', () => {
		for (const shape of ['circle', 'sphere'] as const) {
			const out = paintTriangles(box(20, 20, 20), [brush(shape, 3, [dab([10, 10, 20])])])!;
			expect(paintedArea(out.mesh!, out.triangle), shape).toBeGreaterThan(Math.PI * 9 * 0.9);
			expect(paintedArea(out.mesh!, out.triangle), shape).toBeLessThan(Math.PI * 9 * 1.1);
		}
	});

	it('does not touch the rest of the surface: nothing is painted further than the radius from the dab', () => {
		const out = paintTriangles(box(20, 20, 20), [brush('sphere', 3, [dab([10, 10, 20])])])!;
		for (let t = 0; t < out.triangle.length; t++) {
			if (out.triangle[t] === 0) continue;
			const c = corners(out.mesh!, t);
			const mid = [0, 1, 2].map((a) => (c[0]![a]! + c[1]![a]! + c[2]![a]!) / 3);
			expect(Math.hypot(mid[0]! - 10, mid[1]! - 10, mid[2]! - 20)).toBeLessThanOrEqual(3 + 1e-6);
		}
	});

	it('a sphere wraps round an edge but a circle stays on the face it was put on', () => {
		const m = box(20, 20, 20);
		const at = [dab([20, 10, 20])]; // on the top edge, normal up
		const ball = paintTriangles(m, [brush('sphere', 4, at)])!;
		const disc = paintTriangles(m, [brush('circle', 4, at)])!;
		const side = (out: NonNullable<typeof ball>) => {
			let sum = 0;
			for (let t = 0; t < out.triangle.length; t++) {
				const c = corners(out.mesh!, t);
				if (out.triangle[t] !== 0 && c.every((p) => Math.abs(p[0]! - 20) < 1e-6)) sum += area(out.mesh!, t);
			}
			return sum;
		};
		expect(side(ball)).toBeGreaterThan(5); // down the side face
		expect(side(disc)).toBe(0);
		expect(paintedArea(disc.mesh!, disc.triangle)).toBeGreaterThan(10);
	});

	it('a circle does not reach through a thin plate, but a sphere does', () => {
		const plate = box(30, 30, 1);
		const at = [dab([15, 15, 1])];
		const underside = (out: NonNullable<ReturnType<typeof paintTriangles>>) => {
			let sum = 0;
			for (let t = 0; t < out.triangle.length; t++) {
				const c = corners(out.mesh!, t);
				if (out.triangle[t] !== 0 && c.every((p) => p[2]! < 1e-6)) sum += area(out.mesh!, t);
			}
			return sum;
		};
		expect(underside(paintTriangles(plate, [brush('circle', 5, at)])!)).toBe(0);
		expect(underside(paintTriangles(plate, [brush('sphere', 5, at)])!)).toBeGreaterThan(20);
	});

	it('a triangle brush paints exactly the one triangle under it and cuts nothing', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [brush('triangle', 1, [dab([14, 6, 20])])])!;
		expect(out.mesh).toBeUndefined();
		expect(out.triangle.filter((v) => v !== 0)).toHaveLength(1);
		expect(paintedArea(m, out.triangle)).toBeCloseTo(200, 6);
	});

	it('joins the dabs of a stroke: a row of dabs paints a band, still closed and with the same area', () => {
		const dabs = Array.from({ length: 9 }, (_, i) => dab([4 + i * 1.5, 10, 20]));
		const out = paintTriangles(box(20, 20, 20), [brush('circle', 2, dabs)])!;
		expect(watertight(out.mesh!)).toBe(true);
		expect(totalArea(out.mesh!)).toBeCloseTo(2400, 3);
		const band = paintedArea(out.mesh!, out.triangle);
		expect(band).toBeGreaterThan(12 * 4 * 0.85); // 12 mm long and 4 mm wide, plus the two round ends
		expect(band).toBeLessThan((12 * 4 + Math.PI * 4) * 1.1);
	});

	it('goes on working with the other fills: a smart fill later covers the pieces the brush made, and an erase brush takes paint off', () => {
		const m = box(20, 20, 20);
		const top: PaintFill = { id: 'f', kind: 'region', color: BLUE, point: [5, 5, 20], normal: [0, 0, 1] };
		const filled = paintTriangles(m, [brush('sphere', 3, [dab([10, 10, 20])], RED, 'b'), top])!;
		expect(filled.colors).toEqual([BLUE]);
		expect(paintedArea(filled.mesh!, filled.triangle)).toBeCloseTo(400, 3);
		const erased = paintTriangles(m, [top, brush('sphere', 3, [dab([10, 10, 20])], null, 'e')])!;
		expect(paintedArea(erased.mesh!, erased.triangle)).toBeLessThan(400 - Math.PI * 9 * 0.9);
		expect(paintedArea(erased.mesh!, erased.triangle)).toBeGreaterThan(400 - Math.PI * 9 * 1.1);
	});

	it('keeps colours in order, and a brush that reaches nothing paints nothing (and cuts nothing)', () => {
		const m = box(20, 20, 20);
		const out = paintTriangles(m, [brush('sphere', 2, [dab([5, 5, 20])], RED, 'a'), brush('sphere', 2, [dab([15, 15, 20])], BLUE, 'b')])!;
		expect(out.colors).toEqual([RED, BLUE]);
		const far = paintTriangles(m, [brush('sphere', 2, [dab([10, 10, 90])])]);
		expect(far).toBeNull();
	});

	it('stays quick and finite for a huge brush on a big stroke (the cutting is capped)', () => {
		const m = box(20, 20, 20);
		const dabs = Array.from({ length: 200 }, (_, i) => dab([(i * 7) % 20, (i * 3) % 20, 20]));
		const start = Date.now();
		const out = paintTriangles(m, [brush('sphere', 500, dabs)])!;
		expect(triangleCount(out.mesh ?? m)).toBeLessThan(500_000);
		expect(Date.now() - start).toBeLessThan(5000);
		expect(out.triangle.every((v) => v === 1)).toBe(true); // a 500 mm ball covers the whole box
	});

	it('is the same result run twice', () => {
		const fills = [brush('circle', 3, [dab([10, 10, 20]), dab([12, 10, 20])])];
		const a = paintTriangles(box(20, 20, 20), fills)!;
		const b = paintTriangles(box(20, 20, 20), fills)!;
		expect(Array.from(a.mesh!.positions)).toEqual(Array.from(b.mesh!.positions));
		expect(Array.from(a.triangle)).toEqual(Array.from(b.triangle));
	});
});
