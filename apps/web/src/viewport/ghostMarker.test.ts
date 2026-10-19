import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGhost, placeGhost } from './ghostMarker.ts';

const bounds = (ghost: THREE.Object3D) => {
	ghost.updateMatrixWorld(true);
	const box = new THREE.Box3().setFromObject(ghost);
	return { min: box.min.toArray().map((v) => Math.round(v * 100) / 100), max: box.max.toArray().map((v) => Math.round(v * 100) / 100) };
};

describe('the ghost of a shape being placed', () => {
	it('is the shape at its size, with its base centre where it is put on the floor', () => {
		const ghost = createGhost('box', [20, 20, 20]);
		placeGhost(ghost, { at: [10, 30] });
		expect(ghost.visible).toBe(true);
		expect(bounds(ghost)).toEqual({ min: [0, 20, 0], max: [20, 40, 20] });
	});

	it('stands on a plane, out of its face', () => {
		const ghost = createGhost('box', [20, 20, 20]);
		placeGhost(ghost, { plane: { origin: [0, 0, 20], normal: [0, 0, 1] }, point: [5, 5, 20] });
		expect(bounds(ghost)).toEqual({ min: [-5, -5, 20], max: [15, 15, 40] });
		placeGhost(ghost, { plane: { origin: [50, 0, 0], normal: [1, 0, 0] }, point: [50, 0, 10] });
		const b = bounds(ghost);
		expect(b.min[0]).toBe(50);
		expect(b.max[0]).toBe(70);
	});

	it('is hidden when there is nowhere to put it', () => {
		const ghost = createGhost('box', [20, 20, 20]);
		placeGhost(ghost, { at: [0, 0] });
		placeGhost(ghost, null);
		expect(ghost.visible).toBe(false);
	});

	it('is never picked: clicks and hovers go through it', () => {
		const ghost = createGhost('cylinder', [20, 20, 20]);
		placeGhost(ghost, { at: [0, 0] });
		const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1));
		expect(raycaster.intersectObject(ghost, true)).toEqual([]);
	});

	it('a shape built from its settings is a box of its size, until it is put down', () => {
		const ghost = createGhost('threaded-rod', [10, 10, 40]);
		placeGhost(ghost, { at: [0, 0] });
		expect(bounds(ghost)).toEqual({ min: [-5, -5, 0], max: [5, 5, 40] });
	});
});
