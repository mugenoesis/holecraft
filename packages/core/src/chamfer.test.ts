import { describe, expect, it } from 'vitest';
import { chamferedMesh, chamferOf, setShapeChamfer } from './chamfer.ts';
import { createEmptyDesign } from './design.ts';
import type { MeshData } from './meshShape.ts';
import { addShape } from './ops.ts';

/** Signed volume by the divergence theorem: positive when every triangle faces outwards. */
function volume(m: MeshData): number {
	const p = m.positions;
	let sum = 0;
	for (let i = 0; i < m.indices.length; i += 3) {
		const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
		sum +=
			p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
			p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
			p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
	}
	return sum / 6;
}

/** Closed and consistently wound: every edge is used exactly once in each direction, and no triangle is degenerate. */
function expectWatertight(m: MeshData) {
	const edges = new Map<string, number>();
	for (let i = 0; i < m.indices.length; i += 3) {
		const t = [m.indices[i]!, m.indices[i + 1]!, m.indices[i + 2]!];
		expect(new Set(t).size).toBe(3);
		for (let k = 0; k < 3; k++) {
			const key = `${t[k]}>${t[(k + 1) % 3]}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	}
	for (const [key, n] of edges) {
		expect(n).toBe(1);
		const [a, b] = key.split('>');
		expect(edges.get(`${b}>${a}`)).toBe(1);
	}
}

function bounds(m: MeshData) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < m.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, m.positions[i + k]!);
			max[k] = Math.max(max[k]!, m.positions[i + k]!);
		}
	}
	return { min, max };
}

/** Simpson's rule: exact for the quadratic cross-section areas used here. */
const integrate = (f: (z: number) => number, a: number, b: number) => ((b - a) / 6) * (f(a) + 4 * f((a + b) / 2) + f(b));

describe('chamferedMesh: box', () => {
	it('chamfering all edges cuts every edge and corner: volume from the cross-sections', () => {
		const [w, d, h, c] = [30, 20, 10, 2];
		const m = chamferedMesh('box', w, d, h, c, 'all');
		expectWatertight(m);
		// A slice at height z below c is a rectangle grown by z on each side, with its four corners cut by z; above c it is
		// the full footprint with the four vertical edges cut by c.
		const low = (z: number) => (w - 2 * c + 2 * z) * (d - 2 * c + 2 * z) - 2 * z * z;
		const expected = 2 * integrate(low, 0, c) + (h - 2 * c) * (w * d - 2 * c * c);
		expect(volume(m)).toBeCloseTo(expected, 6);
		expect(bounds(m)).toEqual({ min: [-w / 2, -d / 2, 0], max: [w / 2, d / 2, h] });
	});

	it('chamfering only the top edges leaves the bottom and the vertical edges square', () => {
		const [w, d, h, c] = [30, 20, 10, 3];
		const m = chamferedMesh('box', w, d, h, c, 'top');
		expectWatertight(m);
		const expected = w * d * (h - c) + integrate((t) => (w - 2 * t) * (d - 2 * t), 0, c);
		expect(volume(m)).toBeCloseTo(expected, 6);
	});

	it('bottom edges mirror top edges', () => {
		const top = chamferedMesh('box', 30, 20, 10, 3, 'top');
		const bottom = chamferedMesh('box', 30, 20, 10, 3, 'bottom');
		expectWatertight(bottom);
		expect(volume(bottom)).toBeCloseTo(volume(top), 6);
		// the narrow end is at the bottom: no vertex at z = 0 reaches the full width
		const p = bottom.positions;
		for (let i = 0; i < p.length; i += 3) if (p[i + 2] === 0) expect(Math.abs(p[i]!)).toBeLessThan(15);
	});
});

describe('chamferedMesh: cylinder', () => {
	const N = 64;
	/** Area of the regular N-gon a cylinder of radius r is made of. */
	const area = (r: number) => (N / 2) * r * r * Math.sin((2 * Math.PI) / N);
	/** Volume of a frustum between two similar polygons. */
	const frustum = (a1: number, a2: number, height: number) => (height / 3) * (a1 + a2 + Math.sqrt(a1 * a2));

	it('all edges: a cone at each end', () => {
		const [r, h, c] = [10, 30, 2];
		const m = chamferedMesh('cylinder', 2 * r, 2 * r, h, c, 'all', N);
		expectWatertight(m);
		expect(volume(m)).toBeCloseTo(2 * frustum(area(r - c), area(r), c) + area(r) * (h - 2 * c), 3); // positions are 32-bit floats
	});

	it('top only', () => {
		const [r, h, c] = [10, 30, 4];
		const m = chamferedMesh('cylinder', 2 * r, 2 * r, h, c, 'top', N);
		expectWatertight(m);
		expect(volume(m)).toBeCloseTo(frustum(area(r - c), area(r), c) + area(r) * (h - c), 3);
	});

	it('keeps an oval cylinder oval', () => {
		const m = chamferedMesh('cylinder', 40, 20, 10, 2, 'all', N);
		expectWatertight(m);
		expect(bounds(m)).toEqual({ min: [-20, -10, 0], max: [20, 10, 10] });
	});
});

describe('chamferOf', () => {
	const box = (params: Record<string, unknown>) => {
		const d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
		const node = d.nodes.a!;
		if (node.kind !== 'shape') throw new Error('shape');
		return { ...node, params: { ...node.params, ...params } } as typeof node;
	};

	it('is null without a chamfer, or with nothing to chamfer', () => {
		expect(chamferOf(box({}))).toBeNull();
		expect(chamferOf(box({ chamfer: 0 }))).toBeNull();
		expect(chamferOf(box({ chamfer: -3 }))).toBeNull();
		expect(chamferOf(box({ chamfer: 'big' }))).toBeNull();
		expect(chamferOf({ ...box({ chamfer: 2 }), shapeType: 'sphere' })).toBeNull();
	});

	it('defaults to all edges, and ignores an unknown edge choice', () => {
		expect(chamferOf(box({ chamfer: 2 }))).toEqual({ size: 2, edges: 'all' });
		expect(chamferOf(box({ chamfer: 2, chamferEdges: 'top' }))).toEqual({ size: 2, edges: 'top' });
		expect(chamferOf(box({ chamfer: 2, chamferEdges: 'sideways' }))).toEqual({ size: 2, edges: 'all' });
	});

	it('never lets the chamfers meet: limited to just under half the narrowest side (and the height)', () => {
		// a 20 mm box: all edges allow a little under 10 mm; a single end allows a little under the full height
		expect(chamferOf(box({ chamfer: 50 }))!.size).toBeLessThan(10);
		expect(chamferOf(box({ chamfer: 50 }))!.size).toBeGreaterThan(9.5);
		const flat = {
			...box({ chamfer: 50, chamferEdges: 'top' }),
			params: { width: 40, depth: 40, height: 5, chamfer: 50, chamferEdges: 'top' },
		};
		expect(chamferOf(flat)!.size).toBeLessThan(5);
		expect(chamferOf(flat)!.size).toBeGreaterThan(4.5);
	});
});

describe('setShapeChamfer', () => {
	const start = () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'sphere', [50, 0], { id: 's' }).design;
		return d;
	};

	it('sets the size and the edges', () => {
		const d = setShapeChamfer(start(), 'a', { size: 2, edges: 'top' });
		expect(d.nodes.a!.kind === 'shape' && d.nodes.a!.params).toMatchObject({ chamfer: 2, chamferEdges: 'top' });
	});

	it('changes one without the other', () => {
		let d = setShapeChamfer(start(), 'a', { size: 2, edges: 'top' });
		d = setShapeChamfer(d, 'a', { size: 3 });
		expect(d.nodes.a!.kind === 'shape' && d.nodes.a!.params).toMatchObject({ chamfer: 3, chamferEdges: 'top' });
		d = setShapeChamfer(d, 'a', { edges: 'bottom' });
		expect(d.nodes.a!.kind === 'shape' && d.nodes.a!.params).toMatchObject({ chamfer: 3, chamferEdges: 'bottom' });
	});

	it('a size of 0 removes the chamfer altogether', () => {
		const d = setShapeChamfer(setShapeChamfer(start(), 'a', { size: 2, edges: 'top' }), 'a', { size: 0 });
		const params = d.nodes.a!.kind === 'shape' ? d.nodes.a!.params : {};
		expect('chamfer' in params).toBe(false);
		expect('chamferEdges' in params).toBe(false);
	});

	it('refuses shapes that cannot be chamfered, locked ones, and bad values (same design back)', () => {
		const d = start();
		expect(setShapeChamfer(d, 's', { size: 2 })).toBe(d);
		expect(setShapeChamfer(d, 'nope', { size: 2 })).toBe(d);
		expect(setShapeChamfer(d, 'a', { size: -1 })).toBe(d);
		expect(setShapeChamfer(d, 'a', { size: Number.NaN })).toBe(d);
		expect(setShapeChamfer(d, 'a', { size: 2000 })).toBe(d);
		expect(setShapeChamfer(d, 'a', { edges: 'sideways' as never })).toBe(d);
		const locked = { ...d, nodes: { ...d.nodes, a: { ...d.nodes.a!, locked: true } } };
		expect(setShapeChamfer(locked, 'a', { size: 2 })).toBe(locked);
	});

	it('returns the same design when nothing changes', () => {
		const d = setShapeChamfer(start(), 'a', { size: 2 });
		expect(setShapeChamfer(d, 'a', { size: 2 })).toBe(d);
		const plain = start();
		expect(setShapeChamfer(plain, 'a', { size: 0 })).toBe(plain);
	});
});
