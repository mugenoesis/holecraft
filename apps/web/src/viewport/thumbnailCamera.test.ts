import type { Bounds } from '@holecraft/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { thumbnailCamera } from './thumbnailCamera.ts';

/** Where the eight corners of a box land in the picture, as -1..1 on each axis. */
function extents(bounds: Bounds, camera: THREE.Camera) {
	camera.updateMatrixWorld();
	const xs: number[] = [];
	const ys: number[] = [];
	for (const x of [bounds.min[0], bounds.max[0]]) {
		for (const y of [bounds.min[1], bounds.max[1]]) {
			for (const z of [bounds.min[2], bounds.max[2]]) {
				const p = new THREE.Vector3(x, y, z).project(camera);
				xs.push(p.x);
				ys.push(p.y);
			}
		}
	}
	return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const cases: [string, Bounds][] = [
	['a small cube', { min: [-10, -10, 0], max: [10, 10, 20] }],
	['a wide spread of shapes', { min: [-100, -40, 0], max: [110, 100, 20] }],
	['one tall thin shape', { min: [-5, -5, 0], max: [5, 5, 300] }],
	['something far from the origin', { min: [300, -200, 0], max: [340, -160, 40] }],
];

describe('thumbnailCamera', () => {
	for (const [name, bounds] of cases) {
		it(`keeps all of ${name} in the picture, filling most of it`, () => {
			const camera = thumbnailCamera(bounds, 4 / 3);
			const e = extents(bounds, camera);
			for (const v of [e.minX, e.maxX, e.minY, e.maxY]) expect(Math.abs(v)).toBeLessThanOrEqual(1);
			const fill = Math.max(e.maxX - e.minX, e.maxY - e.minY) / 2;
			expect(fill).toBeGreaterThan(0.75);
		});
	}

	it('looks at the middle of the design', () => {
		const bounds: Bounds = { min: [300, -200, 0], max: [340, -160, 40] };
		const camera = thumbnailCamera(bounds, 4 / 3);
		const e = extents(bounds, camera);
		expect(Math.abs((e.minX + e.maxX) / 2)).toBeLessThan(0.1);
	});

	it('has Z as up, so shapes stand upright', () => {
		const camera = thumbnailCamera({ min: [-10, -10, 0], max: [10, 10, 20] }, 4 / 3);
		expect(camera.up.toArray()).toEqual([0, 0, 1]);
	});

	it('works for a design that is a single point (nothing to size from)', () => {
		const camera = thumbnailCamera({ min: [0, 0, 0], max: [0, 0, 0] }, 4 / 3);
		expect(Number.isFinite(camera.position.x)).toBe(true);
	});
});
