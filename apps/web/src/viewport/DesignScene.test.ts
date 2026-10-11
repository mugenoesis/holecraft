import { addShape, createEmptyDesign, type Design } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let design: Design;

beforeEach(() => {
	scene = new DesignScene();
	design = createEmptyDesign('d');
});

const meshes = () => scene.root.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

describe('DesignScene.sync', () => {
	it('starts empty', () => {
		expect(meshes()).toHaveLength(0);
	});

	it('creates one mesh per shape, positioned and scaled from the document', () => {
		design = addShape(design, 'box', [10, -5], { id: 'a' }).design;
		scene.sync(design);
		const [mesh] = meshes();
		expect(meshes()).toHaveLength(1);
		expect(mesh!.position.toArray()).toEqual([10, -5, 0]);
		expect(mesh!.scale.toArray()).toEqual([20, 20, 20]);
		expect(mesh!.userData.nodeId).toBe('a');
	});

	it('builds unit geometry that rests on z=0 for every shape type', () => {
		for (const type of ['box', 'cylinder', 'sphere'] as const) {
			const d = addShape(createEmptyDesign('x'), type, [0, 0]).design;
			const s = new DesignScene();
			s.sync(d);
			const geo = (s.root.children[0] as THREE.Mesh).geometry;
			geo.computeBoundingBox();
			const bb = geo.boundingBox!;
			expect(bb.min.z).toBeCloseTo(0, 5);
			expect(bb.max.z).toBeCloseTo(1, 5);
			expect(bb.max.x - bb.min.x).toBeCloseTo(1, 2);
			expect(bb.max.y - bb.min.y).toBeCloseTo(1, 2);
		}
	});

	it('uses the shape colour', () => {
		design = addShape(design, 'cylinder', [0, 0], { id: 'a' }).design;
		scene.sync(design);
		const material = meshes()[0]!.material as THREE.MeshStandardMaterial;
		expect(material.color.getHexString()).toBe('2a9d8f');
	});

	it('updates existing meshes in place instead of rebuilding them', () => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		scene.sync(design);
		const before = meshes()[0];
		const moved = {
			...design,
			nodes: { ...design.nodes, a: { ...design.nodes.a!, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 40, 0, 1] } },
		};
		scene.sync(moved);
		expect(meshes()).toHaveLength(1);
		expect(meshes()[0]).toBe(before);
		expect(before!.position.toArray()).toEqual([30, 40, 0]);
	});

	it('removes meshes for deleted shapes and disposes their materials', () => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		design = addShape(design, 'sphere', [0, 0], { id: 'b' }).design;
		scene.sync(design);
		const gone = meshes().find((m) => m.userData.nodeId === 'a')!;
		let disposed = false;
		(gone.material as THREE.Material).addEventListener('dispose', () => (disposed = true));
		scene.sync({ ...design, roots: ['b'], nodes: { b: design.nodes.b! } });
		expect(meshes().map((m) => m.userData.nodeId)).toEqual(['b']);
		expect(disposed).toBe(true);
	});

	it('hides hidden shapes', () => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		design.nodes.a!.hidden = true;
		scene.sync(design);
		expect(meshes()[0]!.visible).toBe(false);
	});
});

describe('DesignScene.dispose', () => {
	it('releases geometry and materials', () => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		scene.sync(design);
		const mesh = meshes()[0]!;
		let geometryDisposed = false;
		let materialDisposed = false;
		mesh.geometry.addEventListener('dispose', () => (geometryDisposed = true));
		(mesh.material as THREE.Material).addEventListener('dispose', () => (materialDisposed = true));
		scene.dispose();
		expect(geometryDisposed).toBe(true);
		expect(materialDisposed).toBe(true);
		expect(scene.root.children).toHaveLength(0);
	});
});
