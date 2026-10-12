import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaneMarker } from './planeMarker.ts';

const world = (g: THREE.Object3D, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrix);

describe('createPlaneMarker', () => {
	it('is a translucent square plus a grid, both ignored by picking', () => {
		const marker = createPlaneMarker({ origin: [0, 0, 20], normal: [0, 0, 1] });
		expect(marker.children).toHaveLength(2);
		const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1));
		expect(ray.intersectObject(marker, true)).toEqual([]);
	});

	it('lies on the plane, a hair in front of it, centred on the origin', () => {
		const marker = createPlaneMarker({ origin: [5, 6, 20], normal: [0, 0, 1] });
		const centre = world(marker, 0, 0, 0);
		expect([centre.x, centre.y]).toEqual([5, 6]);
		expect(centre.z).toBeGreaterThan(20);
		expect(centre.z).toBeLessThan(20.2);
	});

	it('follows a wall: its local z points out of the surface', () => {
		const marker = createPlaneMarker({ origin: [10, 0, 10], normal: [1, 0, 0] });
		const out = world(marker, 0, 0, 1).sub(world(marker, 0, 0, 0));
		expect(out.x).toBeCloseTo(1);
		expect(out.y).toBeCloseTo(0);
		expect(out.z).toBeCloseTo(0);
		// its local y is up the wall
		const up = world(marker, 0, 1, 0).sub(world(marker, 0, 0, 0));
		expect(up.z).toBeCloseTo(1);
	});

	it('does not update its own matrix (it is placed once)', () => {
		expect(createPlaneMarker({ origin: [0, 0, 0], normal: [0, 0, 1] }).matrixAutoUpdate).toBe(false);
	});
});
