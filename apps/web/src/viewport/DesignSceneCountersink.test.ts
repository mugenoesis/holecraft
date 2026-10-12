import { addShape, createEmptyDesign, type Design, setNodeMode, setShapeCountersink, setShapeSize } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let design: Design;

beforeEach(() => {
	scene = new DesignScene();
	// a loose hole (drawn as a ghost): 6 mm wide and deep, 20 mm tall
	let d = addShape(createEmptyDesign('d'), 'cylinder', [0, 0], { id: 'h' }).design;
	d = setShapeSize(d, 'h', { width: 6, depth: 6, height: 20 });
	design = setNodeMode(d, ['h'], 'hole');
});

const meshOf = (id: string) => scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.nodeId === id)!;
const worldSize = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 1000) / 1000);
};
const down = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1));

describe('DesignScene: countersunk holes', () => {
	it('draws the flare: wider than the hole at the top, so a point 5 mm out is on it', () => {
		scene.sync(design);
		expect(scene.pick(down(5, 0))).toBeNull(); // a plain 6 mm hole is only 3 mm out
		scene.sync(setShapeCountersink(design, 'h', { size: 4 }));
		expect(scene.pick(down(5, 0))).toBe('h');
		expect(worldSize(meshOf('h'))).toEqual([14, 14, 20]);
	});

	it('flares at the chosen end', () => {
		scene.sync(setShapeCountersink(design, 'h', { size: 4, end: 'bottom' }));
		expect(worldSize(meshOf('h'))).toEqual([14, 14, 20]);
		// seen from below the flared bottom is hit 5 mm out; from above, only the narrow top end is
		const up = new THREE.Raycaster(new THREE.Vector3(5, 0, -100), new THREE.Vector3(0, 0, 1));
		expect(scene.pick(up)).toBe('h');
	});

	it('goes back to the plain hole without a countersink, and rebuilds when the size changes', () => {
		let d = setShapeCountersink(design, 'h', { size: 4 });
		scene.sync(d);
		const first = meshOf('h').geometry;
		d = setShapeCountersink(d, 'h', { size: 2 });
		scene.sync(d);
		expect(meshOf('h').geometry).not.toBe(first);
		expect(worldSize(meshOf('h'))).toEqual([10, 10, 20]);
		scene.sync(setShapeCountersink(d, 'h', { size: 0 }));
		expect(worldSize(meshOf('h'))).toEqual([6, 6, 20]);
	});

	it('draws nothing extra for a solid cylinder that has a countersink typed in (it only applies to holes)', () => {
		scene.sync(setNodeMode(setShapeCountersink(design, 'h', { size: 4 }), ['h'], 'solid'));
		expect(worldSize(meshOf('h'))).toEqual([6, 6, 20]);
	});
});
