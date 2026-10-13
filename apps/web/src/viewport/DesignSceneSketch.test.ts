import { addSketchShape, createEmptyDesign, rectangleOutline } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
beforeEach(() => {
	scene = new DesignScene();
});

const design = () => {
	const r = addSketchShape(createEmptyDesign('d'), { origin: [0, 0, 0], normal: [0, 0, 1] }, [rectangleOutline([0, 0], [30, 12])], 5, {
		id: 's',
	});
	return r.design;
};
const meshes = () => {
	const out: THREE.Mesh[] = [];
	scene.root.traverse((o) => {
		if (o instanceof THREE.Mesh) out.push(o);
	});
	return out;
};
const sizeOf = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
};
const plate = (): GroupMesh => ({
	positions: new Float32Array([0, 0, 0, 5, 0, 0, 5, 3, 0, 0, 3, 0, 0, 0, 2, 5, 0, 2, 5, 3, 2, 0, 3, 2]),
	indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]),
});

describe('DesignScene: a Sketch shape', () => {
	it('is drawn as a box the size of its drawing until the geometry engine has made it (and does not break)', () => {
		scene.sync(design());
		const shape = meshes().find((m) => m.userData.nodeId === 's')!;
		expect(shape.visible).toBe(true);
		const [w, d, h] = sizeOf(shape);
		expect([w, d, h]).toEqual([expect.closeTo(30, 6), expect.closeTo(12, 6), expect.closeTo(5, 6)]);
	});

	it('is drawn as the engine’s mesh when it arrives, in place of the box', () => {
		const results = new Map<string, GroupResult>([['s', { hash: 'x', mesh: plate() }]]);
		scene.sync(design(), results);
		const drawn = meshes().filter((m) => m.userData.isResult);
		expect(drawn).toHaveLength(1);
		expect(sizeOf(drawn[0]!)).toEqual([5, 3, 2]);
		expect(meshes().find((m) => m.userData.nodeId === 's' && !m.userData.isResult)?.visible).toBe(false);
	});
});

describe('DesignScene while sketching (everything else is faded)', () => {
	const material = (m: THREE.Mesh) => m.material as THREE.MeshStandardMaterial;

	it('draws shapes see-through while dimmed, and solid again after, without changing what is picked', () => {
		const d = design();
		scene.sync(d);
		const shape = () => meshes().find((m) => m.userData.nodeId === 's')!;
		expect(material(shape()).opacity).toBe(1);
		scene.setDimmed(true);
		scene.sync(d);
		expect(material(shape()).transparent).toBe(true);
		expect(material(shape()).opacity).toBeLessThan(0.5);
		expect(scene.pick(new THREE.Raycaster(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, -1)))).toBe('s');
		scene.setDimmed(false);
		scene.sync(d);
		expect(material(shape()).transparent).toBe(false);
		expect(material(shape()).opacity).toBe(1);
	});
});
