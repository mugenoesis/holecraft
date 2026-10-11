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

describe('DesignScene selection highlight', () => {
	const emissiveHex = (m: THREE.Mesh) => (m.material as THREE.MeshStandardMaterial).emissive.getHex();
	const outline = (m: THREE.Mesh) => m.children.find((c) => c.name === 'selection-outline');

	beforeEach(() => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		design = addShape(design, 'sphere', [50, 0], { id: 'b' }).design;
		scene.sync(design);
	});

	it('tints and outlines selected shapes only', () => {
		scene.setSelection(['a']);
		const [a, b] = meshes();
		expect(emissiveHex(a!)).not.toBe(0);
		expect(outline(a!)?.visible).toBe(true);
		expect(emissiveHex(b!)).toBe(0);
		expect(outline(b!)?.visible).toBe(false);
	});

	it('clears the highlight when the selection changes', () => {
		scene.setSelection(['a']);
		scene.setSelection(['b']);
		const [a, b] = meshes();
		expect(emissiveHex(a!)).toBe(0);
		expect(emissiveHex(b!)).not.toBe(0);
	});

	it('keeps the highlight on shapes created after the selection was set', () => {
		scene.setSelection(['c']);
		design = addShape(design, 'cylinder', [0, 40], { id: 'c' }).design;
		scene.sync(design);
		const c = meshes().find((m) => m.userData.nodeId === 'c')!;
		expect(emissiveHex(c)).not.toBe(0);
	});

	it('ignores ids that do not exist', () => {
		expect(() => scene.setSelection(['nope'])).not.toThrow();
	});

	it('disposes the outline with the shape', () => {
		scene.setSelection(['a']);
		const a = meshes().find((m) => m.userData.nodeId === 'a')!;
		const line = outline(a) as THREE.LineSegments;
		let disposed = false;
		(line.material as THREE.Material).addEventListener('dispose', () => (disposed = true));
		scene.sync({ ...design, roots: ['b'], nodes: { b: design.nodes.b! } });
		expect(disposed).toBe(true);
	});
});

describe('DesignScene.pick', () => {
	const rayFrom = (origin: [number, number, number], dir: [number, number, number]) =>
		new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());

	beforeEach(() => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		design = addShape(design, 'sphere', [50, 0], { id: 'b' }).design;
		scene.sync(design);
	});

	it('returns the shape under the ray', () => {
		expect(scene.pick(rayFrom([0, 0, 100], [0, 0, -1]))).toBe('a');
		expect(scene.pick(rayFrom([50, 0, 100], [0, 0, -1]))).toBe('b');
	});

	it('returns null when the ray hits nothing', () => {
		expect(scene.pick(rayFrom([200, 200, 100], [0, 0, -1]))).toBeNull();
	});

	it('returns the nearest of overlapping shapes', () => {
		design = addShape(design, 'box', [0, 0], { id: 'top' }).design;
		design.nodes.top!.transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1];
		scene.sync(design);
		expect(scene.pick(rayFrom([0, 0, 100], [0, 0, -1]))).toBe('top');
	});

	it('skips hidden shapes', () => {
		design.nodes.a!.hidden = true;
		scene.sync(design);
		expect(scene.pick(rayFrom([0, 0, 100], [0, 0, -1]))).toBeNull();
	});

	it('is not fooled by the selection outline sticking out around a shape', () => {
		scene.setSelection(['a']);
		expect(scene.pick(rayFrom([200, 200, 100], [0, 0, -1]))).toBeNull();
	});
});

describe('DesignScene.idsInRect (marquee)', () => {
	let camera: THREE.PerspectiveCamera;

	beforeEach(() => {
		design = addShape(design, 'box', [0, 0], { id: 'a' }).design;
		design = addShape(design, 'box', [80, 0], { id: 'b' }).design;
		scene.sync(design);
		// Looking straight down at the origin from 300 mm up, 1:1 aspect.
		camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
		camera.up.set(0, 0, 1);
		camera.position.set(0, -0.001, 300);
		camera.lookAt(0, 0, 0);
		camera.updateMatrixWorld();
	});

	it('selects shapes whose screen footprint overlaps the rectangle', () => {
		expect(scene.idsInRect(camera, { minX: -0.1, maxX: 0.1, minY: -0.1, maxY: 0.1 })).toEqual(['a']);
	});

	it('selects several shapes with a bigger rectangle', () => {
		expect(scene.idsInRect(camera, { minX: -1, maxX: 1, minY: -1, maxY: 1 }).sort()).toEqual(['a', 'b']);
	});

	it('selects nothing for an empty area', () => {
		expect(scene.idsInRect(camera, { minX: -1, maxX: -0.9, minY: 0.8, maxY: 1 })).toEqual([]);
	});

	it('skips hidden shapes', () => {
		design.nodes.a!.hidden = true;
		scene.sync(design);
		expect(scene.idsInRect(camera, { minX: -0.1, maxX: 0.1, minY: -0.1, maxY: 0.1 })).toEqual([]);
	});
});
