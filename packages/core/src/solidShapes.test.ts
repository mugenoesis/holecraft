import { describe, expect, it } from 'vitest';
import type { MeshData } from './meshShape.ts';
import { signedVolume } from './meshShape.ts';
import { SOLID_SHAPE_TYPES, unitSolidMesh } from './solidShapes.ts';

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
	return { min, max };
};

/** Unit volumes worked out from the shapes' dimensions (the base fills the unit square or circle, the height is 1). */
const N = 64;
const cone = ((N / 2) * 0.25 * Math.sin((2 * Math.PI) / N)) / 3; // polygon base of radius 0.5, a third of base times height
const EXPECTED: Record<string, { volume: number; tolerance: number }> = {
	cone: { volume: cone, tolerance: 1e-6 },
	pyramid: { volume: 1 / 3, tolerance: 1e-6 },
	wedge: { volume: 1 / 2, tolerance: 1e-6 },
	hexagon: { volume: 0.75, tolerance: 1e-6 }, // corners at (±0.5, 0) and (±0.25, ±0.5): a 0.5 square and two 0.25 x 0.5 triangles, 1 high
	roof: { volume: 1 / 2, tolerance: 1e-6 },
	'half-sphere': { volume: (2 / 3) * Math.PI * 0.25, tolerance: 0.015 }, // half an ellipsoid, 0.5 x 0.5 x 1: a faceted surface falls a little short
	'round-roof': { volume: (Math.PI * 0.5 * 1) / 2, tolerance: 0.01 }, // half an ellipse (0.5 wide, 1 high) one unit long
};

describe('the solid shapes', () => {
	it('lists the shapes that have a mesh', () => {
		expect([...SOLID_SHAPE_TYPES].sort()).toEqual(Object.keys(EXPECTED).sort());
	});

	it('gives nothing for the shapes that are built another way', () => {
		for (const type of ['box', 'cylinder', 'sphere', 'mesh', 'nonsense']) expect(unitSolidMesh(type)).toBeNull();
	});

	for (const type of SOLID_SHAPE_TYPES) {
		describe(type, () => {
			const mesh = unitSolidMesh(type)!;

			it('is a closed surface that faces outwards, with the volume its shape has', () => {
				expect(isClosed(mesh)).toBe(true);
				const { volume, tolerance } = EXPECTED[type]!;
				expect(signedVolume(mesh)).toBeGreaterThan(0);
				expect(Math.abs(signedVolume(mesh) - volume) / volume).toBeLessThan(Math.max(tolerance, 1e-6));
			});

			it('fills the unit box like every other shape: x and y within ±0.5 (touching both sides), z from 0 to 1', () => {
				const { min, max } = bounds(mesh);
				expect(min.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-0.5, -0.5, 0]);
				expect(max.map((v) => Math.round(v * 1e6) / 1e6)[2]).toBe(1);
				expect(max[0]).toBeCloseTo(0.5, 6);
				expect(max[1]).toBeCloseTo(0.5, 6);
			});

			it('is the same seen in a mirror (left to right), which keeps Flip exact', () => {
				const key = (x: number, y: number, z: number) => `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
				const points = new Set<string>();
				for (let i = 0; i < mesh.positions.length; i += 3)
					points.add(key(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!));
				for (let i = 0; i < mesh.positions.length; i += 3) {
					expect(points.has(key(-mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!))).toBe(true);
				}
			});
		});
	}

	it('has the apex over the middle for a cone and a pyramid, and the slope towards the front for a wedge', () => {
		const top = (type: string) => {
			const m = unitSolidMesh(type)!;
			const at: number[][] = [];
			for (let i = 0; i < m.positions.length; i += 3) if (m.positions[i + 2] === 1) at.push([m.positions[i]!, m.positions[i + 1]!]);
			return at;
		};
		expect(top('cone')).toEqual([[0, 0]]);
		expect(top('pyramid')).toEqual([[0, 0]]);
		expect(new Set(top('wedge').map((p) => p[1]))).toEqual(new Set([0.5])); // the tall side is the back (+y)
		expect(new Set(top('roof').map((p) => p[0]))).toEqual(new Set([0])); // the ridge runs front to back, over the middle
	});
});
