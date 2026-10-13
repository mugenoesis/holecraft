import { addShape, createEmptyDesign } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
beforeEach(() => {
	scene = new DesignScene();
});

const design = () => addShape(createEmptyDesign('d'), 'text', [0, 0], { id: 't' }).design;
const meshes = () => {
	const out: THREE.Mesh[] = [];
	scene.root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
	return out;
};
const sizeOf = (m: THREE.Mesh) => {
	m.updateMatrixWorld(true);
	const b = new THREE.Box3().setFromObject(m, true);
	return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
};
const letter = (): GroupMesh => ({
	positions: new Float32Array([0, 0, 0, 5, 0, 0, 5, 3, 0, 0, 3, 0, 0, 0, 2, 5, 0, 2, 5, 3, 2, 0, 3, 2]),
	indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]),
});

describe('DesignScene: a Text shape', () => {
	it('is drawn as a box the size of its letters until the geometry engine has made them (and does not break)', () => {
		scene.sync(design());
		const shape = meshes().find((m) => m.userData.nodeId === 't')!;
		expect(shape.visible).toBe(true);
		const [w, d, h] = sizeOf(shape);
		expect(w).toBeGreaterThan(10);
		expect(d).toBeGreaterThan(4);
		expect(h).toBeCloseTo(3, 6);
	});

	it('is drawn as the letters when they arrive, in place of the box', () => {
		const results = new Map<string, GroupResult>([['t', { hash: 'x', mesh: letter() }]]);
		scene.sync(design(), results);
		const drawn = meshes().filter((m) => m.userData.isResult);
		expect(drawn).toHaveLength(1);
		expect(sizeOf(drawn[0]!)).toEqual([5, 3, 2]);
		expect(meshes().find((m) => m.userData.nodeId === 't' && !m.userData.isResult)?.visible).toBe(false);
	});
});
