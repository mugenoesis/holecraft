import { addShape, createEmptyDesign, type Design, setNodeEuler } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let design: Design;

beforeEach(() => {
	scene = new DesignScene();
	design = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
});

const mesh = () => scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
const ray = (origin: [number, number, number]) => new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(0, 0, -1));

describe('DesignScene with rotated shapes', () => {
	it('turns the mesh to match the document', () => {
		scene.sync(setNodeEuler(design, 'a', [0, 0, 90]));
		const x = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh().quaternion);
		expect(x.x).toBeCloseTo(0, 6);
		expect(x.y).toBeCloseTo(1, 6);
	});

	it('keeps the mesh centred where the document puts it when tipped over', () => {
		scene.sync(setNodeEuler(design, 'a', [90, 0, 0]));
		mesh().updateMatrixWorld(true);
		// The unit mesh's middle is half way up its own axis, in world space.
		const middle = new THREE.Vector3(0, 0, 0.5).applyMatrix4(mesh().matrixWorld);
		expect(middle.x).toBeCloseTo(0, 6);
		expect(middle.y).toBeCloseTo(0, 6);
		expect(middle.z).toBeCloseTo(10, 6);
	});

	it('updates an existing mesh when the shape is turned', () => {
		scene.sync(design);
		const before = mesh();
		scene.sync(setNodeEuler(design, 'a', [0, 0, 45]));
		expect(mesh()).toBe(before);
		expect(new THREE.Vector3(1, 0, 0).applyQuaternion(before.quaternion).y).toBeCloseTo(Math.SQRT1_2, 6);
	});

	it('picks the turned footprint, not the original one', () => {
		scene.sync(setNodeEuler(design, 'a', [0, 0, 45])); // a diamond reaching 14.1 mm along X
		expect(scene.pick(ray([13, 0, 100]))).toBe('a');
		expect(scene.pick(ray([13, 8, 100]))).toBeNull();
	});

	it('selects by marquee using the turned shape', () => {
		scene.sync(setNodeEuler(design, 'a', [0, 0, 45]));
		const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
		camera.up.set(0, 0, 1);
		camera.position.set(0, -0.001, 300);
		camera.lookAt(0, 0, 0);
		camera.updateMatrixWorld();
		// A thin vertical strip just inside the diamond's tip, beyond the unturned box's edge.
		const strip = { minX: 0.1, maxX: 0.12, minY: -0.01, maxY: 0.01 };
		expect(scene.idsInRect(camera, strip)).toEqual(['a']);
	});
});
