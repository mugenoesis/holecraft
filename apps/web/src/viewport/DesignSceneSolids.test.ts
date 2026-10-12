import { addShape, createEmptyDesign, type Design, type ShapeType, setShapeSize } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
beforeEach(() => {
	scene = new DesignScene();
});

/** One shape of the given kind, 40 wide, 20 deep and 20 tall, at the origin. */
const shaped = (type: ShapeType): Design =>
	setShapeSize(addShape(createEmptyDesign('d'), type, [0, 0], { id: 'a' }).design, 'a', { width: 40, depth: 20, height: 20 });

const meshOf = () => scene.root.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.userData.nodeId === 'a')!;
const worldSize = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => Math.round(v * 100) / 100);
};
/** Where a ray shot along `direction` from `from` first hits the shape, or null. */
function hit(from: [number, number, number], direction: [number, number, number]): THREE.Vector3 | null {
	const raycaster = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...direction));
	const mesh = meshOf();
	mesh.updateMatrixWorld(true);
	return raycaster.intersectObject(mesh, false)[0]?.point ?? null; // not its children: the selection outline is lines
}

const NEW: ShapeType[] = ['cone', 'pyramid', 'wedge', 'roof', 'round-roof', 'half-sphere'];

describe('DesignScene: the basic shapes', () => {
	for (const type of NEW) {
		it(`${type}: is drawn stretched to its size, resting on the floor`, () => {
			scene.sync(shaped(type));
			expect(worldSize(meshOf())).toEqual([40, 20, 20]);
			const box = new THREE.Box3().setFromObject(meshOf(), true);
			expect(Math.round(box.min.z * 100) / 100).toBe(0);
		});
	}

	// a ray along -x at the middle of the depth (y = 0), 15 mm up the 20 mm height: it meets the shape's side at half its width there
	it('narrows with height: cone, pyramid and roof are 5 mm out on each side at three quarters of the way up (40 mm wide at the base)', () => {
		for (const type of ['cone', 'pyramid', 'roof'] as const) {
			scene.sync(shaped(type));
			expect(hit([100, 0, 15], [-1, 0, 0])!.x, type).toBeCloseTo(5, 3);
		}
	});

	it('round roof and half sphere are rounded: 0.66 of the half width at three quarters of the way up', () => {
		const expected = 20 * Math.sqrt(1 - 0.75 ** 2); // an ellipse 20 out at the base and 20 high
		scene.sync(shaped('round-roof'));
		expect(hit([100, 0, 15], [-1, 0, 0])!.x).toBeCloseTo(expected, 1);
		scene.sync(shaped('half-sphere'));
		expect(hit([100, 0, 15], [-1, 0, 0])!.x).toBeGreaterThan(expected - 0.4);
		expect(hit([100, 0, 15], [-1, 0, 0])!.x).toBeLessThan(expected + 0.01);
	});

	it('the wedge slopes down towards the front: at half height its slope is at the middle of the depth', () => {
		scene.sync(shaped('wedge'));
		expect(hit([0, -100, 10], [0, 1, 0])!.y).toBeCloseTo(0, 3);
		expect(hit([0, 100, 10], [0, -1, 0])!.y).toBeCloseTo(10, 3); // the back is a wall
	});

	it('changes shape when the type of the same node is swapped in the document (a duplicate draws its own geometry)', () => {
		scene.sync(shaped('cone'));
		const cone = meshOf().geometry;
		scene.sync(shaped('pyramid'));
		expect(meshOf().geometry).not.toBe(cone);
	});
});
