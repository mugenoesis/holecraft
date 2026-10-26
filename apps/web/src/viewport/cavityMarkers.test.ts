import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type CavityShape, createCavityMarkers, pickCavity } from './cavityMarkers.ts';

/** A closed box from (x, 0, 0) to (x + 2, 2, 2). */
function box(id: number, x: number): CavityShape {
	const g = new THREE.BoxGeometry(2, 2, 2).translate(x + 1, 1, 1).toNonIndexed();
	const positions = g.getAttribute('position').array as Float32Array;
	return { id, fill: { positions, indices: new Uint32Array(Array.from({ length: positions.length / 3 }, (_, i) => i)) } };
}

const opacities = (group: THREE.Group) => group.children.map((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity);
const along = (x: number) => new THREE.Raycaster(new THREE.Vector3(x, 1, 10), new THREE.Vector3(0, 0, -1));

describe('createCavityMarkers', () => {
	it('draws a volume for each cavity, the chosen one stronger', () => {
		const group = createCavityMarkers([box(0, 0), box(1, 10)], 1);
		const [plain, chosen] = opacities(group);
		expect(group.children).toHaveLength(2);
		expect(chosen).toBeGreaterThan(plain!);
	});
});

describe('pickCavity', () => {
	it('gives the number of the cavity a ray passes through', () => {
		const group = createCavityMarkers([box(0, 0), box(1, 10)], null);
		expect(pickCavity(group, along(11))).toBe(1);
		expect(pickCavity(group, along(1))).toBe(0);
	});

	it('gives null when the ray misses them all', () => {
		expect(pickCavity(createCavityMarkers([box(0, 0)], null), along(5))).toBeNull();
	});
});
