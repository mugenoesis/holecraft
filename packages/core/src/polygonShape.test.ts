import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import { setShapeSize } from './edit.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { PARAMETRIC_TYPES, parametricShape, setShapeParam, shapeParam, shapeParamMm, typedParamMm } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';
import { setLocked } from './visibility.ts';

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

function polygon(size: [number, number, number], sides?: number): ShapeNode {
	const base = addShape(createEmptyDesign('d'), 'polygon', [0, 0], { id: 'a' }).design.nodes.a as ShapeNode;
	return {
		...base,
		params: { ...base.params, width: size[0], depth: size[1], height: size[2], ...(sides === undefined ? {} : { sides }) },
	};
}

/**
 * Worked out by hand. A regular n-gon of radius 1 with a corner at the back is n triangles from its middle, (1/2)*sin(2pi/n) each. Its
 * corners are at angles 90 deg + k*360/n; it is stretched so those corners touch the sides, back and front of its box.
 */
function expectedVolume(n: number, w: number, d: number, h: number): number {
	const angles = Array.from({ length: n }, (_, k) => Math.PI / 2 + (2 * Math.PI * k) / n);
	const xs = angles.map((a) => Math.cos(a));
	const ys = angles.map((a) => Math.sin(a));
	const [halfWide, deep] = [Math.max(...xs), Math.max(...ys) - Math.min(...ys)];
	return (n / 2) * Math.sin((2 * Math.PI) / n) * (w / (2 * halfWide)) * (d / deep) * h;
}

describe('the polygon', () => {
	it('is built from its settings, with a Sides count that starts at 5', () => {
		expect(PARAMETRIC_TYPES).toContain('polygon');
		expect(getShapeDef('polygon').name).toBe('Polygon');
		expect(getShapeDef('polygon').params).toEqual([expect.objectContaining({ key: 'sides', label: 'Sides', count: true })]);
		expect(shapeParam(polygon(getShapeDef('polygon').defaultSize), 'sides')).toBe(5);
	});

	it('keeps Sides as a whole number that does not change with the size (it is a count, not a share of the shape)', () => {
		expect(shapeParamMm(polygon([20, 20, 20], 7), 'sides')).toBe(7);
		expect(shapeParamMm(polygon([80, 40, 20], 7), 'sides')).toBe(7);
		expect(shapeParam(polygon([20, 20, 20], 6.6), 'sides')).toBe(7); // rounded
		expect(shapeParam(polygon([20, 20, 20], 2), 'sides')).toBe(3); // a polygon has at least three sides
		expect(shapeParam(polygon([20, 20, 20], 500), 'sides')).toBe(getShapeDef('polygon').params![0]!.max);
		expect(typedParamMm(polygon([20, 20, 20], 500), 'sides')).toBe(500); // what was typed is kept
	});

	it('is set to a whole number, in one step, refused when locked, and untouched by resizing', () => {
		const design = addShape(createEmptyDesign('d'), 'polygon', [0, 0], { id: 'a' }).design;
		const next = setShapeParam(design, 'a', 'sides', 8.4);
		expect(shapeParam(next.nodes.a as ShapeNode, 'sides')).toBe(8);
		expect((next.nodes.a as ShapeNode).params.sides).toBe(8);
		expect(setShapeParam(next, 'a', 'sides', 8)).toBe(next);
		expect(setShapeParam(setLocked(next, ['a'], true), 'a', 'sides', 6)).toEqual(setLocked(next, ['a'], true));
		const bigger = setShapeSize(next, 'a', { width: 60, depth: 60 });
		expect(shapeParam(bigger.nodes.a as ShapeNode, 'sides')).toBe(8);
	});

	for (const n of [3, 4, 5, 6, 8, 12]) {
		it(`with ${n} sides is a closed surface facing outwards with the volume worked out by hand, filling its box exactly`, () => {
			const [w, d, h] = [30, 26, 8];
			const mesh = parametricShape(polygon([w, d, h], n))!;
			expect(isClosed(mesh)).toBe(true);
			expect(signedVolume(mesh)).toBeCloseTo(expectedVolume(n, w, d, h), 3);
			const { min, max } = bounds(mesh);
			expect(min).toEqual([-w / 2, -d / 2, 0]);
			expect(max).toEqual([w / 2, d / 2, h]);
		});
	}

	it('is the same seen in a mirror (left to right), which keeps Flip exact', () => {
		const key = (x: number, y: number, z: number) => [x, y, z].map((v) => Math.round(v * 1e4) / 1e4 + 0).join(',');
		for (const n of [3, 5, 6, 7]) {
			const mesh = parametricShape(polygon([20, 18, 10], n))!;
			const points = new Set<string>();
			for (let i = 0; i < mesh.positions.length; i += 3)
				points.add(key(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!));
			for (const p of points) {
				const [x, y, z] = p.split(',').map(Number) as [number, number, number];
				expect(points.has(key(-x, y, z))).toBe(true);
			}
		}
	});
});
