import { describe, expect, it } from 'vitest';
import type { Vec3 } from './camera.ts';
import type { PaintFill } from './design.ts';
import type { MeshData } from './meshShape.ts';
import { paintTriangles } from './paintRegions.ts';

/** A box from (0,0,0) to (w,d,h), 8 shared corners and 12 triangles, outward. Each face is two triangles. */
function box(w: number, d: number, h: number): MeshData {
	const p = [0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h];
	const i = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
	return { positions: new Float32Array(p), indices: new Uint32Array(i) };
}

/** An upright cylinder of `n` sides (radius r, height h) with a fan on each end. Triangles 0..2n-1 are the side, then the bottom, then the top. */
function cylinder(n: number, r: number, h: number): MeshData {
	const p: number[] = [];
	for (let k = 0; k < n; k++) p.push(r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), 0);
	for (let k = 0; k < n; k++) p.push(r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n), h);
	p.push(0, 0, 0, 0, 0, h);
	const i: number[] = [];
	for (let k = 0; k < n; k++) {
		const k2 = (k + 1) % n;
		i.push(k, k2, n + k2, k, n + k2, n + k);
	}
	for (let k = 0; k < n; k++) i.push(2 * n, (k + 1) % n, k);
	for (let k = 0; k < n; k++) i.push(2 * n + 1, n + k, n + ((k + 1) % n));
	return { positions: new Float32Array(p), indices: new Uint32Array(i) };
}

const area = (m: MeshData, t: number) => {
	const c = [0, 1, 2].map((k) => [0, 1, 2].map((a) => m.positions[m.indices[t * 3 + k]! * 3 + a]!));
	const u = [0, 1, 2].map((a) => c[1]![a]! - c[0]![a]!);
	const v = [0, 1, 2].map((a) => c[2]![a]! - c[0]![a]!);
	return Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
};
const paintedArea = (m: MeshData, tri: Uint16Array, which: number) => {
	let sum = 0;
	for (let t = 0; t < tri.length; t++) if (tri[t] === which) sum += area(m, t);
	return sum;
};
const count = (tri: Uint16Array, which: number) => tri.reduce((n, v) => n + (v === which ? 1 : 0), 0);

const region = (color: string, point: Vec3, normal: Vec3, id = 'a'): PaintFill => ({ id, kind: 'region', color, point, normal });
const body = (color: string, id = 'b'): PaintFill => ({ id, kind: 'body', color });
const RED = '#ff0000';
const BLUE = '#0000ff';

describe('paintTriangles', () => {
	it('gives nothing for no fills', () => {
		expect(paintTriangles(box(10, 10, 10), [])).toBeNull();
	});

	it('paints one flat face of a box and nothing else: the top is the two triangles that make 10 x 20 mm', () => {
		const m = box(10, 20, 5);
		const out = paintTriangles(m, [region(RED, [5, 10, 5], [0, 0, 1])])!;
		expect(out.colors).toEqual([RED]);
		expect(count(out.triangle, 1)).toBe(2);
		expect(paintedArea(m, out.triangle, 1)).toBeCloseTo(200, 6);
		expect(count(out.triangle, 0)).toBe(10);
	});

	it('paints the face that was clicked even where two faces meet: the point is on the edge but the normal says which', () => {
		const m = box(10, 10, 10);
		const side = paintTriangles(m, [region(RED, [10, 5, 10], [1, 0, 0])])!;
		const top = paintTriangles(m, [region(RED, [10, 5, 10], [0, 0, 1])])!;
		expect(paintedArea(m, side.triangle, 1)).toBeCloseTo(100, 6);
		expect(paintedArea(m, top.triangle, 1)).toBeCloseTo(100, 6);
		expect(side.triangle).not.toEqual(top.triangle);
	});

	it('fills every triangle of a face that is cut into many (a 4 x 4 grid of squares)', () => {
		const n = 4;
		const p: number[] = [];
		const idx: number[] = [];
		for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) p.push(x, y, 0);
		for (let y = 0; y < n; y++) {
			for (let x = 0; x < n; x++) {
				const a = y * (n + 1) + x;
				idx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
			}
		}
		const m = { positions: new Float32Array(p), indices: new Uint32Array(idx) };
		const out = paintTriangles(m, [region(RED, [0.5, 0.2, 0], [0, 0, 1])])!;
		expect(count(out.triangle, 1)).toBe(32);
	});

	it('fills a smooth curved surface up to its sharp edges: the side of a 48-sided cylinder, not its ends', () => {
		const m = cylinder(48, 10, 20);
		const out = paintTriangles(m, [region(RED, [10, 0, 10], [1, 0, 0])])!;
		expect(count(out.triangle, 1)).toBe(96);
		expect(paintedArea(m, out.triangle, 1)).toBeCloseTo(48 * 2 * 10 * Math.sin(Math.PI / 48) * 20, 3); // the side's area: 48 flat strips
		const top = paintTriangles(m, [region(RED, [0, 0, 20], [0, 0, 1])])!;
		expect(count(top.triangle, 1)).toBe(48);
	});

	it('stops at a corner between facets that turn more than 30 degrees: a 6-sided cylinder paints one strip', () => {
		const m = cylinder(6, 10, 20);
		const r = 10 * Math.cos(Math.PI / 6); // the strip between corners 0 and 1 is centred at 30 degrees
		const mid: Vec3 = [r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6), 10];
		const out = paintTriangles(m, [region(RED, mid, [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0])])!;
		expect(count(out.triangle, 1)).toBe(2);
	});

	it('paints a body whole, and a body fill covers what was painted before it', () => {
		const m = box(10, 10, 10);
		const out = paintTriangles(m, [region(RED, [5, 5, 10], [0, 0, 1]), body(BLUE)])!;
		expect(out.colors).toEqual([BLUE]);
		expect(count(out.triangle, 1)).toBe(12);
	});

	it('lets a later fill paint over an earlier one, and numbers the colours in the order they first show', () => {
		const m = box(10, 10, 10);
		const out = paintTriangles(m, [body(BLUE, 'b'), region(RED, [5, 5, 10], [0, 0, 1], 'r'), region(RED, [5, 5, 0], [0, 0, -1], 'r2')])!;
		expect(out.colors).toEqual([BLUE, RED]);
		expect(count(out.triangle, 2)).toBe(4);
		expect(count(out.triangle, 1)).toBe(8);
		// painting the top blue again leaves it blue, and red is only on the bottom
		const back = paintTriangles(m, [region(RED, [5, 5, 10], [0, 0, 1], 'r'), region(BLUE, [5, 5, 10], [0, 0, 1], 'r2')])!;
		expect(back.colors).toEqual([BLUE]);
		expect(count(back.triangle, 1)).toBe(2);
	});

	it('paints nothing where the point no longer touches the surface, or faces another way (the shape was changed)', () => {
		const m = box(10, 10, 10);
		expect(paintTriangles(m, [region(RED, [5, 5, 30], [0, 0, 1])])).toBeNull(); // 20 mm above the top
		expect(paintTriangles(m, [region(RED, [5, 5, 5], [0, 0, 1])])).toBeNull(); // inside, 5 mm below the top
		expect(paintTriangles(m, [region(RED, [5, 5, 10], [0, 0, -1])])).toBeNull(); // on the top, but facing down: the bottom is 10 mm away
	});

	it('follows the surface when the shape is stretched (the point is stretched with it, within reach)', () => {
		const out = paintTriangles(box(10, 10, 12), [region(RED, [5, 5, 10], [0, 0, 1])]); // the top moved 2 mm up
		expect(out).toBeNull();
		const near = paintTriangles(box(10, 10, 10.3), [region(RED, [5, 5, 10], [0, 0, 1])])!; // 0.3 mm off is still on it
		expect(count(near.triangle, 1)).toBe(2);
	});

	it('survives the mesh being built in another order, and degenerate triangles', () => {
		const m = box(10, 10, 10);
		const reversed = { positions: m.positions, indices: new Uint32Array(Array.from(m.indices).reverse()) };
		const out = paintTriangles(reversed, [region(RED, [5, 5, 10], [0, 0, 1])]);
		expect(out).toBeNull(); // reversed winding faces inwards: the outward normal of this fill no longer matches
		const withDegenerate = { positions: m.positions, indices: new Uint32Array([...m.indices, 0, 0, 1]) };
		const ok = paintTriangles(withDegenerate, [region(RED, [5, 5, 10], [0, 0, 1])])!;
		expect(count(ok.triangle, 1)).toBe(2);
		expect(ok.triangle).toHaveLength(13);
	});
});

describe('erasing, the smart fill angle and the bucket fill (as in OrcaSlicer’s colour painting)', () => {
	const erase = (point: Vec3, normal: Vec3, id = 'e'): PaintFill => ({ id, kind: 'region', color: null, point, normal });
	const smart = (angle: number, point: Vec3, normal: Vec3, color = RED, id = 'a'): PaintFill => ({
		id,
		kind: 'region',
		color,
		point,
		normal,
		angle,
	});
	const bucket = (color: string | null, point: Vec3, normal: Vec3, id = 'k'): PaintFill => ({
		id,
		kind: 'region',
		color,
		point,
		normal,
		spread: 'bucket',
	});
	const up: Vec3 = [0, 0, 1];

	it('erases back to unpainted: a fill with no colour takes the paint off the face it covers, and nothing else', () => {
		const m = box(10, 10, 10);
		const out = paintTriangles(m, [body(RED), erase([5, 5, 10], up)])!;
		expect(count(out.triangle, 1)).toBe(10);
		expect(count(out.triangle, 0)).toBe(2);
		expect(out.colors).toEqual([RED]);
	});

	it('gives nothing when everything painted is erased again, and the erased colour is not listed', () => {
		const m = box(10, 10, 10);
		expect(paintTriangles(m, [region(RED, [5, 5, 10], up, 'r'), erase([5, 5, 10], up)])).toBeNull();
		const two = paintTriangles(m, [region(RED, [5, 5, 10], up, 'r'), region(BLUE, [5, 5, 0], [0, 0, -1], 'b'), erase([5, 5, 10], up)])!;
		expect(two.colors).toEqual([BLUE]);
	});

	it('spreads a smart fill over faces that turn up to its angle: 6 strips of a hexagonal prism turn 60 degrees from each other', () => {
		const m = cylinder(6, 10, 20);
		const r = 10 * Math.cos(Math.PI / 6);
		const strip: Vec3 = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0];
		const mid: Vec3 = [r * strip[0], r * strip[1], 10];
		expect(count(paintTriangles(m, [smart(30, mid, strip)])!.triangle, 1)).toBe(2);
		expect(count(paintTriangles(m, [smart(59, mid, strip)])!.triangle, 1)).toBe(2);
		expect(count(paintTriangles(m, [smart(61, mid, strip)])!.triangle, 1)).toBe(12); // all six strips, but not the ends (90 degrees)
	});

	it('goes over every edge at 90 degrees: a box is painted whole by a smart fill of 90', () => {
		const out = paintTriangles(box(10, 10, 10), [smart(90, [5, 5, 10], up)])!;
		expect(count(out.triangle, 1)).toBe(12);
	});

	it('bucket fill spreads over everything of the same colour that is joined to it, across sharp edges', () => {
		const m = box(10, 10, 10);
		const out = paintTriangles(m, [region(RED, [5, 5, 10], up, 'r'), bucket(BLUE, [5, 0, 5], [0, -1, 0])])!;
		expect(out.colors).toEqual([RED, BLUE]);
		expect(count(out.triangle, 1)).toBe(2); // the top stays red
		expect(count(out.triangle, 2)).toBe(10); // every unpainted face is joined to the one pointed at
	});

	it('bucket fill on a painted face recolours just that painted region', () => {
		const m = box(10, 10, 10);
		const out = paintTriangles(m, [
			body(RED),
			region(BLUE, [5, 5, 10], up, 'r'),
			bucket(BLUE, [5, 5, 10], up, 'k2'),
			bucket('#00ff00', [5, 5, 10], up, 'k3'),
		])!;
		expect(out.colors).toEqual([RED, '#00ff00']);
		expect(count(out.triangle, 2)).toBe(2);
		expect(count(out.triangle, 1)).toBe(10);
	});

	it('bucket fill with no colour erases a whole painted region at once', () => {
		const m = box(10, 10, 10);
		const out = paintTriangles(m, [body(RED), region(BLUE, [5, 5, 10], up, 'r'), bucket(null, [5, 0, 5], [0, -1, 0])])!;
		expect(out.colors).toEqual([BLUE]);
		expect(count(out.triangle, 1)).toBe(2);
		expect(count(out.triangle, 0)).toBe(10);
	});
});
