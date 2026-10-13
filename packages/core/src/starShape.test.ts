import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type ShapeNode } from './design.ts';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { PARAMETRIC_TYPES, parametricShape, setShapeParam, shapeParam, shapeParamMm } from './parametricShapes.ts';
import { getShapeDef } from './shapes.ts';

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

function star(size: [number, number, number], extra: Record<string, number> = {}): ShapeNode {
	const base = addShape(createEmptyDesign('d'), 'star', [0, 0], { id: 'a' }).design.nodes.a as ShapeNode;
	return { ...base, params: { ...base.params, width: size[0], depth: size[1], height: size[2], ...extra } };
}

const deg = (d: number) => (d * Math.PI) / 180;
/**
 * Worked out by hand. A five-pointed star of outer radius 1 and inner radius r is ten triangles from its centre, each (1/2)*1*r*sin(36deg),
 * so 5*r*sin(36deg). Its tips reach sin(72deg) to each side, and from -cos(36deg) to 1 front to back, which is stretched to fill width x depth.
 */
const starVolume = (r: number, w: number, d: number, h: number) =>
	5 * r * Math.sin(deg(36)) * (w / (2 * Math.sin(deg(72)))) * (d / (1 + Math.cos(deg(36)))) * h;

describe('the star', () => {
	it('is built from its settings, five-pointed, with an Inner radius that starts at 40% of the shape', () => {
		expect(PARAMETRIC_TYPES).toContain('star');
		expect(getShapeDef('star').name).toBe('Star');
		expect(getShapeDef('star').params).toEqual([expect.objectContaining({ key: 'inner', label: 'Inner radius' })]);
		const n = star(getShapeDef('star').defaultSize);
		expect(shapeParam(n, 'inner')).toBeCloseTo(0.4, 9);
		expect(shapeParamMm(n, 'inner')).toBeCloseTo(4, 9); // 40% of the half-width (10 mm)
	});

	it('is a closed surface facing outwards with the volume worked out by hand, for the default and a stretched, fatter-armed star', () => {
		for (const [size, inner] of [
			[getShapeDef('star').defaultSize, 0.4],
			[[40, 20, 6], 0.6],
		] as const) {
			const mesh = parametricShape(star([...size], { inner }))!;
			expect(isClosed(mesh)).toBe(true);
			expect(signedVolume(mesh)).toBeCloseTo(starVolume(inner, size[0], size[1], size[2]), 4);
		}
	});

	it('fills its box exactly: tips touch both sides and front and back, and it stands on z = 0', () => {
		const [w, d, h] = [30, 28, 8];
		const { min, max } = bounds(parametricShape(star([w, d, h]))!);
		expect(min).toEqual([-w / 2, -d / 2, 0]);
		expect(max).toEqual([w / 2, d / 2, h]);
	});

	it('is the same seen in a mirror (left to right), which keeps Flip exact', () => {
		const mesh = parametricShape(star([20, 19, 10]))!;
		const key = (x: number, y: number, z: number) => [x, y, z].map((v) => Math.round(v * 1e4) / 1e4 + 0).join(',');
		const points = new Set<string>();
		for (let i = 0; i < mesh.positions.length; i += 3) points.add(key(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!));
		for (const p of points) {
			const [x, y, z] = p.split(',').map(Number) as [number, number, number];
			expect(points.has(key(-x, y, z))).toBe(true);
		}
	});

	it('takes a typed inner radius in mm and keeps it as a share, limited to what fits', () => {
		const design = addShape(createEmptyDesign('d'), 'star', [0, 0], { id: 'a' }).design;
		const next = setShapeParam(design, 'a', 'inner', 6);
		expect(shapeParamMm(next.nodes.a as ShapeNode, 'inner')).toBeCloseTo(6, 9);
		expect(shapeParam(setShapeParam(design, 'a', 'inner', 500).nodes.a as ShapeNode, 'inner')).toBeLessThan(1);
	});
});
