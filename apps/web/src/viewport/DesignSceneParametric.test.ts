import { addShape, createEmptyDesign, type Design, type ShapeType, setShapeParam, setShapeSize } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
beforeEach(() => {
	scene = new DesignScene();
});

const one = (type: ShapeType, size: [number, number, number]): Design =>
	setShapeSize(addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design, 'a', {
		width: size[0],
		depth: size[1],
		height: size[2],
	});

const meshOf = () => scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.nodeId === 'a')!;
const worldSize = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 100) / 100);
};
const down = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1));

describe('DesignScene: the tube', () => {
	it('is hollow: a ray down the middle misses, one through the wall hits', () => {
		scene.sync(one('tube', [20, 20, 20]));
		expect(scene.pick(down(0, 0))).toBeNull();
		expect(scene.pick(down(8.5, 0))).toBe('a'); // the wall is 3 mm thick: from 7 to 10 mm out
		expect(scene.pick(down(5, 0))).toBeNull(); // inside the hole
	});

	it('is drawn at its real size, and the selection outline fits it', () => {
		scene.sync(one('tube', [30, 20, 12]));
		expect(worldSize(meshOf())).toEqual([30, 20, 12]);
		const outline = meshOf().getObjectByName('selection-outline')!;
		outline.updateMatrixWorld(true);
		const box = new THREE.Box3().setFromObject(outline);
		expect([box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((v) => Math.round(v * 100) / 100)).toEqual([
			30, 20, 12,
		]);
	});

	it('rebuilds when the wall changes: a thicker wall reaches further in', () => {
		let d = one('tube', [20, 20, 20]);
		scene.sync(d);
		const first = meshOf().geometry;
		expect(scene.pick(down(5, 0))).toBeNull();
		d = setShapeParam(d, 'a', 'wall', 6);
		scene.sync(d);
		expect(meshOf().geometry).not.toBe(first);
		expect(scene.pick(down(5, 0))).toBe('a'); // the wall now runs from 4 to 10 mm out
	});

	it('stretches evenly when resized: the hole grows with the shape, and the old geometry is freed', () => {
		let d = one('tube', [20, 20, 20]); // a 3 mm wall: a hole 7 mm out
		scene.sync(d);
		const first = meshOf().geometry;
		let disposed = false;
		first.addEventListener('dispose', () => {
			disposed = true;
		});
		expect(scene.pick(down(8.5, 0))).toBe('a');
		d = setShapeSize(d, 'a', { width: 40, depth: 40 });
		scene.sync(d);
		expect(disposed).toBe(true);
		// the wall is 6 mm now, from 14 to 20 mm out
		expect(scene.pick(down(12, 0))).toBeNull();
		expect(scene.pick(down(15, 0))).toBe('a');
	});
});

describe('DesignScene: the torus', () => {
	it('is a ring: a ray down the middle misses, one through the tube hits', () => {
		scene.sync(one('torus', [30, 30, 10]));
		expect(scene.pick(down(0, 0))).toBeNull();
		expect(scene.pick(down(10, 0))).toBe('a'); // the middle of the ring's tube
		expect(worldSize(meshOf())).toEqual([30, 30, 10]);
	});

	it('rebuilds when the ring thickness changes', () => {
		let d = one('torus', [30, 30, 10]);
		scene.sync(d);
		const first = meshOf().geometry;
		d = setShapeParam(d, 'a', 'thickness', 4);
		scene.sync(d);
		expect(meshOf().geometry).not.toBe(first);
		expect(scene.pick(down(5, 0))).toBeNull(); // the hole is now 15 - 4 = 11 mm out
		expect(scene.pick(down(13, 0))).toBe('a');
	});
});
