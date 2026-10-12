import { addShape, createEmptyDesign, type Design, setShapeChamfer, setShapeSize } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let design: Design;

beforeEach(() => {
	scene = new DesignScene();
	design = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design; // 20 x 20 x 20
});

const meshOf = (id: string) => scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.nodeId === id)!;
const worldSize = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 1000) / 1000);
};
const down = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1));

describe('DesignScene: chamfered shapes', () => {
	it('draws the chamfer: the cut-off corner is empty, the middle is not', () => {
		scene.sync(setShapeChamfer(design, 'a', { size: 4 }));
		expect(scene.pick(down(0, 0))).toBe('a');
		expect(scene.pick(down(9.5, 9.5))).toBeNull(); // inside the square footprint, but cut away by the vertical edge chamfer
	});

	it('keeps the outside size, and the selection outline fits it', () => {
		scene.sync(setShapeChamfer(setShapeSize(design, 'a', { width: 40, depth: 10, height: 6 }), 'a', { size: 2 }));
		const mesh = meshOf('a');
		expect(worldSize(mesh)).toEqual([40, 10, 6]);
		const outline = mesh.getObjectByName('selection-outline')!;
		outline.updateMatrixWorld(true);
		const box = new THREE.Box3().setFromObject(outline);
		expect([box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((v) => Math.round(v * 1000) / 1000)).toEqual([
			40, 10, 6,
		]);
	});

	it('rebuilds when the size or the chamfer changes, and goes back to the plain shape without one', () => {
		let d = setShapeChamfer(design, 'a', { size: 2 });
		scene.sync(d);
		const first = meshOf('a').geometry;
		d = setShapeSize(d, 'a', { width: 50 });
		scene.sync(d);
		expect(meshOf('a').geometry).not.toBe(first);
		expect(worldSize(meshOf('a'))).toEqual([50, 20, 20]);
		d = setShapeChamfer(d, 'a', { size: 0 });
		scene.sync(d);
		expect(worldSize(meshOf('a'))).toEqual([50, 20, 20]);
		expect(scene.pick(down(24.5, 9.5))).toBe('a'); // the corner is there again
	});

	it('keeps one geometry per chamfered shape, freeing the old one when it is replaced', () => {
		let d = setShapeChamfer(design, 'a', { size: 2 });
		scene.sync(d);
		const first = meshOf('a').geometry;
		let disposed = false;
		first.addEventListener('dispose', () => {
			disposed = true;
		});
		d = setShapeChamfer(d, 'a', { size: 3 });
		scene.sync(d);
		expect(disposed).toBe(true);
	});
});
