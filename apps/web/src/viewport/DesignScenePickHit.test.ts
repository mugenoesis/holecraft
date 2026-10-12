import { addShape, createEmptyDesign, setHidden, setNodeEuler } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;

/** A ray from (x, y, 100) straight down. */
const down = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1));
const sideways = () => new THREE.Raycaster(new THREE.Vector3(-100, 0, 10), new THREE.Vector3(1, 0, 0));

beforeEach(() => {
	scene = new DesignScene();
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design; // 20 x 20 x 20
	scene.sync(d);
});

describe('DesignScene.pickHit', () => {
	it('gives the point and face direction where a ray meets a shape', () => {
		const hit = scene.pickHit(down(2, 3))!;
		expect(hit.id).toBe('a');
		expect(hit.point[0]).toBeCloseTo(2);
		expect(hit.point[1]).toBeCloseTo(3);
		expect(hit.point[2]).toBeCloseTo(20);
		expect(hit.normal[2]).toBeCloseTo(1);
	});

	it('reports a side face with its sideways normal', () => {
		const hit = scene.pickHit(sideways())!;
		expect(hit.point[0]).toBeCloseTo(-10);
		expect(hit.normal[0]).toBeCloseTo(-1);
	});

	it('follows a shape that has been turned', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = setNodeEuler(d, 'a', [0, 45, 0]);
		scene.sync(d);
		const hit = scene.pickHit(down(3, 0))!;
		expect(Math.abs(hit.normal[0])).toBeCloseTo(Math.SQRT1_2); // the top now slopes
	});

	it('misses empty space, and hidden shapes', () => {
		expect(scene.pickHit(down(80, 80))).toBeNull();
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		scene.sync(setHidden(d, ['a'], true));
		expect(scene.pickHit(down(0, 0))).toBeNull();
	});
});
