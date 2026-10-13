import { addShape, createEmptyDesign, setShapeParam, setShapeSize } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
beforeEach(() => {
	scene = new DesignScene();
});

const meshOf = () => scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.nodeId === 'a')!;
const sizeOf = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 100) / 100);
};

describe('DesignScene: threaded shapes', () => {
	it('draws a rod at its real size: M5 is 5 mm across and as long as asked', () => {
		scene.sync(addShape(createEmptyDesign('d'), 'threaded-rod', [0, 0], { id: 'a' }).design);
		expect(sizeOf(meshOf())).toEqual([5, 5, 20]);
	});

	it('rebuilds the thread when the Size or the Length changes, and frees the old one', () => {
		let d = addShape(createEmptyDesign('d'), 'threaded-rod', [0, 0], { id: 'a' }).design;
		scene.sync(d);
		let first = meshOf().geometry;
		let disposed = false;
		first.addEventListener('dispose', () => {
			disposed = true;
		});
		d = setShapeParam(d, 'a', 'size', 8);
		scene.sync(d);
		expect(disposed).toBe(true);
		expect(meshOf().geometry).not.toBe(first);
		expect(sizeOf(meshOf())).toEqual([8, 8, 20]);
		first = meshOf().geometry;
		scene.sync(setShapeSize(d, 'a', { height: 45 }));
		expect(meshOf().geometry).not.toBe(first);
		expect(sizeOf(meshOf())).toEqual([8, 8, 45]);
	});

	it('draws a hole’s cutter as a pale ghost of the thread opened out by its fit', () => {
		scene.sync(addShape(createEmptyDesign('d'), 'threaded-hole', [0, 0], { id: 'a' }).design);
		expect(sizeOf(meshOf())).toEqual([5.4, 5.4, 10]);
	});
});
