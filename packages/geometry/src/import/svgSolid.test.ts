import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadManifold } from '../load.ts';
import { svgToMesh } from './svgSolid.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const volume = (m: { positions: Float32Array; indices: Uint32Array }) => {
	let sum = 0;
	for (let i = 0; i < m.indices.length; i += 3) {
		const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
		const p = m.positions;
		sum +=
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
};
const zRange = (m: { positions: Float32Array }) => {
	const zs = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + 2]!);
	return [Math.min(...zs), Math.max(...zs)];
};

describe('svgToMesh', () => {
	it('extrudes a rectangle to the depth asked: area times depth, standing on z = 0', () => {
		const mesh = svgToMesh(M, svg('<rect width="30" height="20"/>'), 5);
		expect(volume(mesh)).toBeCloseTo(30 * 20 * 5, 3);
		expect(zRange(mesh)).toEqual([0, 5]);
	});

	it('cuts a hole where one contour is inside another by even-odd filling, and fills it by non-zero filling of the same direction', () => {
		const rings = 'M0 0H40V40H0Z M10 10H30V30H10Z';
		expect(volume(svgToMesh(M, svg(`<path fill-rule="evenodd" d="${rings}"/>`), 2))).toBeCloseTo((1600 - 400) * 2, 3);
		expect(volume(svgToMesh(M, svg(`<path d="${rings}"/>`), 2))).toBeCloseTo(1600 * 2, 3); // both go the same way: no hole
		const opposite = 'M0 0H40V40H0Z M10 10V30H30V10Z'; // the inner one the other way round: a hole
		expect(volume(svgToMesh(M, svg(`<path d="${opposite}"/>`), 2))).toBeCloseTo((1600 - 400) * 2, 3);
	});

	it('joins shapes that overlap into one solid (their union, not their sum)', () => {
		const two = '<rect width="20" height="20"/><rect x="10" y="10" width="20" height="20"/>';
		expect(volume(svgToMesh(M, svg(two), 3))).toBeCloseTo((400 + 400 - 100) * 3, 3);
	});

	it('extrudes a circle to within the facet error, and scales with the size of the drawing', () => {
		const circle = svgToMesh(M, svg('<circle cx="50" cy="50" r="10"/>'), 4);
		expect(Math.abs(volume(circle) - Math.PI * 100 * 4) / (Math.PI * 100 * 4)).toBeLessThan(0.005);
		const big = svgToMesh(M, svg('<rect width="10" height="10"/>', 'width="20mm" height="20mm" viewBox="0 0 10 10"'), 1);
		expect(volume(big)).toBeCloseTo(400, 3);
	});

	it('gives a surface the importer can use: every edge once each way', () => {
		const mesh = svgToMesh(M, svg('<path fill-rule="evenodd" d="M0 0H40V40H0Z M10 10H30V30H10Z"/>'), 2);
		const seen = new Map<string, number>();
		for (let t = 0; t < mesh.indices.length; t += 3) {
			for (let k = 0; k < 3; k++) {
				const key = `${mesh.indices[t + k]},${mesh.indices[t + ((k + 1) % 3)]}`;
				seen.set(key, (seen.get(key) ?? 0) + 1);
			}
		}
		expect([...seen].every(([key, n]) => n === 1 && seen.get(key.split(',').reverse().join(',')) === 1)).toBe(true);
		expect(volume(mesh)).toBeGreaterThan(0);
	});

	it('says what is wrong rather than giving nothing: no filled shapes, and a depth that is not a thickness', () => {
		expect(() => svgToMesh(M, svg(''), 5)).toThrow(/no filled shapes/i);
		expect(() => svgToMesh(M, svg('<rect width="10" height="10"/>'), 0)).toThrow(/depth/i);
		expect(() => svgToMesh(M, svg('<rect width="10" height="10"/>'), Number.NaN)).toThrow(/depth/i);
	});
});
