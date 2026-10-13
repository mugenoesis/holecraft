import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBandMarker } from './bandMarker.ts';

const boxOf = (marker: THREE.Object3D) => new THREE.Box3().setFromObject(marker);

describe('the height range marker', () => {
	it('is a slab across the object’s width and depth, from the height of the pointer up by the band’s height', () => {
		const b = boxOf(createBandMarker({ min: [-10, -5, 0], max: [10, 5, 20] }, 7, 9.5));
		expect(b.min.z).toBeCloseTo(7, 6);
		expect(b.max.z).toBeCloseTo(9.5, 6);
		expect(b.min.x).toBeLessThan(-10);
		expect(b.max.x).toBeGreaterThan(10);
		expect(b.min.x).toBeGreaterThan(-10.5);
		expect(b.max.y).toBeGreaterThan(5);
	});

	it('stays visible for a very thin band, and is not part of picking (the tools aim through it)', () => {
		const marker = createBandMarker({ min: [0, 0, 0], max: [1, 1, 1] }, 0.5, 0.5);
		expect(boxOf(marker).max.z - boxOf(marker).min.z).toBeGreaterThan(0.01);
		const ray = new THREE.Raycaster(new THREE.Vector3(0.5, 0.5, 5), new THREE.Vector3(0, 0, -1));
		expect(ray.intersectObject(marker, true)).toHaveLength(0);
	});

	it('is see-through and does not hide what is behind it', () => {
		const mesh = createBandMarker({ min: [0, 0, 0], max: [1, 1, 1] }, 0, 1).children[0] as THREE.Mesh;
		const material = mesh.material as THREE.MeshBasicMaterial;
		expect(material.transparent).toBe(true);
		expect(material.opacity).toBeLessThan(0.5);
		expect(material.depthWrite).toBe(false);
	});
});
