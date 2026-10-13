import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { PARAMETRIC_TYPES, parametricMesh, setShapeParam, shapeParam, shapeParamMm } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';
import { setLocked } from './visibility.ts';

/** Every directed edge of a closed, consistently turned surface appears once, and so does its reverse. */
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
	return { min: min.map((v) => Math.round(v * 1e5) / 1e5), max: max.map((v) => Math.round(v * 1e5) / 1e5) };
};

/** A shape node of the given type, size and extra settings. */
function node(type: 'tube' | 'torus', size: [number, number, number], extra: Record<string, number> = {}): ShapeNode {
	const base = addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design.nodes.a as ShapeNode;
	return { ...base, params: { ...base.params, width: size[0], depth: size[1], height: size[2], ...extra } };
}

describe('the settings a shape declares', () => {
	it('a tube has a wall thickness and a torus a ring thickness, shown in mm, with defaults that are 3 mm and 10 mm at the default size', () => {
		expect(getShapeDef('tube').params).toEqual([expect.objectContaining({ key: 'wall', label: 'Wall thickness' })]);
		expect(getShapeDef('torus').params).toEqual([expect.objectContaining({ key: 'thickness', label: 'Ring thickness' })]);
		expect(getShapeDef('box').params).toBeUndefined();
		expect(shapeParamMm(node('tube', [20, 20, 20]), 'wall')).toBeCloseTo(3, 9);
		expect(shapeParamMm(node('torus', [30, 30, 10]), 'thickness')).toBeCloseTo(10, 9);
	});

	it('are kept as a share of the shape, so the whole shape stretches evenly: the wall of a tube made twice as big is twice as thick', () => {
		const small = node('tube', [20, 20, 20], { wall: 0.3 });
		const big = node('tube', [40, 40, 20], { wall: 0.3 });
		expect(shapeParamMm(small, 'wall')).toBeCloseTo(3, 9);
		expect(shapeParamMm(big, 'wall')).toBeCloseTo(6, 9);
		expect(shapeParam(small, 'wall')).toBe(shapeParam(big, 'wall'));
		// a ring's tube thickens with the ring
		expect(shapeParamMm(node('torus', [60, 60, 20]), 'thickness')).toBeCloseTo(20, 9);
	});

	it('are measured against the narrower side, so a long thin tube’s field is the wall where it is thinnest', () => {
		expect(shapeParamMm(node('tube', [20, 40, 20], { wall: 0.3 }), 'wall')).toBeCloseTo(3, 9);
		expect(shapeParamMm(node('tube', [40, 20, 20], { wall: 0.3 }), 'wall')).toBeCloseTo(3, 9);
	});

	it('limit what is used to what fits (a wall can never fill the whole tube), but keep what was typed', () => {
		const wide = node('tube', [20, 30, 20], { wall: 4 });
		expect(shapeParam(wide, 'wall')).toBe(0.95);
		expect(shapeParamMm(wide, 'wall')).toBeCloseTo(9.5, 9); // under half the narrower side
		expect(wide.params.wall).toBe(4);
		expect(shapeParamMm(node('torus', [30, 20, 10], { thickness: 3 }), 'thickness')).toBeCloseTo(9, 9); // a tube at most 45% of the narrower side across, so a hole is left
	});

	it('have a floor too, and fall back to the default for something that is not a number', () => {
		expect(shapeParam(node('tube', [20, 20, 20], { wall: 0 }), 'wall')).toBeGreaterThan(0);
		expect(shapeParamMm(node('tube', [20, 20, 20], { wall: Number.NaN }), 'wall')).toBeCloseTo(3, 9);
		expect(
			shapeParamMm({ ...node('tube', [20, 20, 20]), params: { width: 20, depth: 20, height: 20, wall: 'thick' } }, 'wall'),
		).toBeCloseTo(3, 9);
	});
});

describe('setShapeParam', () => {
	const start = () => addShape(createEmptyDesign('d'), 'tube', [0, 0], { id: 'a' }).design;
	const nodeOf = (d: ReturnType<typeof start>) => d.nodes.a as ShapeNode;

	it('takes the value in mm and keeps it as a share of the shape (4 mm of a 10 mm radius is 40%)', () => {
		const d = setShapeParam(start(), 'a', 'wall', 4);
		expect(nodeOf(d).params.wall).toBeCloseTo(0.4, 9);
		expect(shapeParamMm(nodeOf(d), 'wall')).toBeCloseTo(4, 9);
		expect(nodeOf(start()).params.wall).toBeUndefined();
	});

	it('stays 4 mm for the shape it was typed on, but stretches with it afterwards', () => {
		const d = setShapeParam(start(), 'a', 'wall', 4);
		const bigger = { ...d, nodes: { ...d.nodes, a: { ...nodeOf(d), params: { ...nodeOf(d).params, width: 40, depth: 40 } } } };
		expect(shapeParamMm(nodeOf(bigger), 'wall')).toBeCloseTo(8, 9);
	});

	it('keeps a value too big for the shape as typed (it is limited when read), so growing the shape gives it back', () => {
		const d = setShapeParam(start(), 'a', 'wall', 30); // 300% of the radius
		expect(nodeOf(d).params.wall).toBeCloseTo(3, 9);
		expect(shapeParamMm(nodeOf(d), 'wall')).toBeCloseTo(9.5, 9);
		const bigger = { ...d, nodes: { ...d.nodes, a: { ...nodeOf(d), params: { ...nodeOf(d).params, width: 100, depth: 100 } } } };
		expect(shapeParamMm(nodeOf(bigger), 'wall')).toBeCloseTo(47.5, 9); // still limited: 3 times the radius is more than fits at any size
	});

	it('returns the same design for the same value, a setting the shape does not have, bad numbers, locked and other nodes', () => {
		const d = setShapeParam(start(), 'a', 'wall', 4);
		expect(setShapeParam(d, 'a', 'wall', 4)).toBe(d);
		const base = start();
		expect(setShapeParam(base, 'a', 'sides', 5)).toBe(base);
		expect(setShapeParam(base, 'a', 'wall', Number.NaN)).toBe(base);
		expect(setShapeParam(base, 'a', 'wall', -1)).toBe(base);
		expect(setShapeParam(base, 'a', 'wall', 0)).toBe(base);
		expect(setShapeParam(base, 'a', 'wall', 5000)).toBe(base);
		expect(setShapeParam(base, 'missing', 'wall', 4)).toBe(base);
		const locked = setLocked(base, ['a'], true);
		expect(setShapeParam(locked, 'a', 'wall', 4)).toBe(locked);
		const box = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'b' }).design;
		expect(setShapeParam(box, 'b', 'wall', 4)).toBe(box);
	});
});

describe('the tube', () => {
	const N = 64;
	/** Area of an N-sided polygon inscribed in an ellipse with semi-axes a and b. */
	const area = (a: number, b: number) => (N / 2) * a * b * Math.sin((2 * Math.PI) / N);

	it('is a closed solid facing outwards: the outer ellipse minus the same ellipse shrunk by the wall, as tall as it is high', () => {
		const mesh = parametricMesh('tube', 20, 30, 12, { wall: 0.3 })!;
		expect(isClosed(mesh)).toBe(true);
		expect(signedVolume(mesh)).toBeCloseTo((area(10, 15) - area(7, 10.5)) * 12, 3); // the hole is the outline shrunk to 70%: a scaled copy, not a wall of one thickness all round
		expect(bounds(mesh)).toEqual({ min: [-10, -15, 0], max: [10, 15, 12] });
	});

	it('has the hole through it: the inner wall is the wall thickness (a quarter of the 10 mm radius here) in from the outside', () => {
		const mesh = parametricMesh('tube', 20, 20, 10, { wall: 0.25 })!;
		let inner = Infinity;
		for (let i = 0; i < mesh.positions.length; i += 3) inner = Math.min(inner, Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!));
		expect(inner).toBeCloseTo(7.5, 5);
	});

	it('is the same seen in a mirror (left to right), which keeps Flip exact', () => {
		const mesh = parametricMesh('tube', 20, 30, 12, { wall: 0.3 })!;
		const key = (x: number, y: number, z: number) =>
			`${(Math.round(x * 1e4) / 1e4 + 0).toFixed(4)},${(Math.round(y * 1e4) / 1e4 + 0).toFixed(4)},${z.toFixed(4)}`;
		const points = new Set<string>();
		for (let i = 0; i < mesh.positions.length; i += 3) points.add(key(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!));
		for (let i = 0; i < mesh.positions.length; i += 3)
			expect(points.has(key(-mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!))).toBe(true);
	});
});

describe('the torus', () => {
	it('is a closed solid facing outwards that fills its box: 30 x 30 wide, 10 high, standing on the floor', () => {
		const mesh = parametricMesh('torus', 30, 30, 10, { thickness: 1 / 3 })!;
		expect(isClosed(mesh)).toBe(true);
		expect(signedVolume(mesh)).toBeGreaterThan(0);
		expect(bounds(mesh)).toEqual({ min: [-15, -15, 0], max: [15, 15, 10] });
	});

	it('has the volume of a ring (2 * pi^2 * R * r^2: a round tube of radius 5 round a circle of radius 10), a little under for the facets', () => {
		const mesh = parametricMesh('torus', 30, 30, 10, { thickness: 1 / 3 })!;
		const exact = 2 * Math.PI ** 2 * 10 * 5 ** 2;
		expect(signedVolume(mesh)).toBeLessThan(exact);
		expect((exact - signedVolume(mesh)) / exact).toBeLessThan(0.02);
	});

	it('has a hole in the middle: nothing within the ring’s inner radius', () => {
		const mesh = parametricMesh('torus', 30, 30, 10, { thickness: 0.2 })!;
		let inner = Infinity;
		for (let i = 0; i < mesh.positions.length; i += 3) inner = Math.min(inner, Math.hypot(mesh.positions[i]!, mesh.positions[i + 1]!));
		expect(inner).toBeCloseTo(15 - 6, 1); // the hole's radius is the outer radius less the ring's thickness
	});

	it('stretches into an oval ring with a taller or flatter tube, and still fills its box', () => {
		const mesh = parametricMesh('torus', 40, 24, 16, { thickness: 0.2 })!;
		expect(isClosed(mesh)).toBe(true);
		expect(bounds(mesh)).toEqual({ min: [-20, -12, 0], max: [20, 12, 16] });
	});

	it('is the same seen in a mirror (left to right), which keeps Flip exact', () => {
		const mesh = parametricMesh('torus', 40, 24, 16, { thickness: 0.2 })!;
		const key = (x: number, y: number, z: number) =>
			`${(Math.round(x * 1e4) / 1e4 + 0).toFixed(4)},${(Math.round(y * 1e4) / 1e4 + 0).toFixed(4)},${z.toFixed(4)}`;
		const points = new Set<string>();
		for (let i = 0; i < mesh.positions.length; i += 3) points.add(key(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!));
		for (let i = 0; i < mesh.positions.length; i += 3)
			expect(points.has(key(-mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!))).toBe(true);
	});
});

describe('which shapes are built from their settings', () => {
	it('lists the tube, the torus, the star and the polygon, and gives nothing for the others', () => {
		expect([...PARAMETRIC_TYPES].sort()).toEqual(['polygon', 'star', 'torus', 'tube']);
		for (const type of ['box', 'cylinder', 'cone', 'wedge', 'mesh', 'nonsense']) expect(parametricMesh(type, 20, 20, 20, {})).toBeNull();
	});
});
