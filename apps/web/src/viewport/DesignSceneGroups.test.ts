import { addShape, createEmptyDesign, type Design, groupNodes, moveNodes, setNodeMode, ungroupNodes } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let loose: Design;
let grouped: Design;

beforeEach(() => {
	scene = new DesignScene();
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	d = addShape(d, 'cylinder', [0, 80], { id: 'c' }).design;
	loose = d;
	grouped = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
});

const allMeshes = () => {
	const out: THREE.Mesh[] = [];
	scene.root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
	return out;
};
const mesh = (id: string) => allMeshes().find((m) => m.userData.nodeId === id)!;
const material = (id: string) => mesh(id).material as THREE.MeshStandardMaterial;
const ray = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1));

describe('DesignScene with groups', () => {
	it('draws a group as one object holding its children', () => {
		scene.sync(grouped);
		const top = scene.root.children;
		expect(top).toHaveLength(2); // the group, and the loose cylinder
		const group = top.find((o) => o instanceof THREE.Group)!;
		expect(group.children.filter((c) => c instanceof THREE.Mesh)).toHaveLength(2);
	});

	it('keeps loose shapes as direct children, as before', () => {
		scene.sync(loose);
		expect(scene.root.children.every((c) => c instanceof THREE.Mesh)).toBe(true);
	});

	it('places children relative to the group', () => {
		scene.sync(moveNodes(grouped, ['g'], [10, 0, 0]));
		scene.root.updateMatrixWorld(true);
		const world = new THREE.Vector3().setFromMatrixPosition(mesh('a').matrixWorld);
		expect(world.x).toBeCloseTo(10, 6);
		expect(mesh('a').position.x).toBe(0); // its own transform is unchanged
	});

	it('follows a turned group', () => {
		const turned = structuredClone(grouped);
		turned.nodes.g!.transform = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; // quarter turn about Z
		scene.sync(turned);
		scene.root.updateMatrixWorld(true);
		const world = new THREE.Vector3().setFromMatrixPosition(mesh('b').matrixWorld);
		expect(world.x).toBeCloseTo(0, 6);
		expect(world.y).toBeCloseTo(50, 6);
	});

	it('picks the group when any child is hit', () => {
		scene.sync(grouped);
		expect(scene.pick(ray(0, 0))).toBe('g');
		expect(scene.pick(ray(50, 0))).toBe('g');
		expect(scene.pick(ray(0, 80))).toBe('c');
		expect(scene.pick(ray(200, 200))).toBeNull();
	});

	it('highlights every shape inside a selected group, and only those', () => {
		scene.sync(grouped);
		scene.setSelection(['g']);
		const lit = (id: string) => material(id).emissive.getHex() !== 0;
		expect([lit('a'), lit('b'), lit('c')]).toEqual([true, true, false]);
		expect(mesh('a').getObjectByName('selection-outline')!.visible).toBe(true);
		expect(mesh('c').getObjectByName('selection-outline')!.visible).toBe(false);
	});

	it('selects a group once by marquee, however many children it holds', () => {
		scene.sync(grouped);
		const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
		camera.up.set(0, 0, 1);
		camera.position.set(25, -0.001, 400);
		camera.lookAt(25, 0, 0);
		camera.updateMatrixWorld();
		expect(scene.idsInRect(camera, { minX: -1, maxX: 1, minY: -0.2, maxY: 0.2 })).toEqual(['g']);
	});

	it("hides a hidden group's children", () => {
		const hidden = structuredClone(grouped);
		hidden.nodes.g!.hidden = true;
		scene.sync(hidden);
		expect(scene.pick(ray(0, 0))).toBeNull();
	});
});

describe('DesignScene holes', () => {
	it('draws holes as translucent ghosts and solids normally', () => {
		scene.sync(setNodeMode(grouped, ['b'], 'hole'));
		expect(material('b').transparent).toBe(true);
		expect(material('b').opacity).toBeLessThan(1);
		expect(material('b').depthWrite).toBe(false);
		expect(material('a').transparent).toBe(false);
		expect(material('a').opacity).toBe(1);
	});

	it('uses a neutral ghost colour rather than the shape colour', () => {
		const before = grouped.nodes.b!.color;
		scene.sync(setNodeMode(grouped, ['b'], 'hole'));
		expect(material('b').color.getHexString()).not.toBe(before.slice(1));
	});

	it('works for loose holes too', () => {
		scene.sync(setNodeMode(loose, ['a'], 'hole'));
		expect(material('a').transparent).toBe(true);
	});

	it('makes everything inside a hole group ghostly', () => {
		scene.sync(setNodeMode(grouped, ['g'], 'hole'));
		expect(material('a').transparent).toBe(true);
		expect(material('b').transparent).toBe(true);
		expect(material('c').transparent).toBe(false);
	});

	it('toggles back to solid on the same mesh, restoring the colour', () => {
		scene.sync(setNodeMode(grouped, ['b'], 'hole'));
		const before = mesh('b');
		scene.sync(grouped);
		expect(mesh('b')).toBe(before);
		expect(material('b').transparent).toBe(false);
		expect(material('b').color.getHexString()).toBe(grouped.nodes.b!.color.slice(1));
	});
});

describe('DesignScene restructuring', () => {
	it('reuses meshes when shapes are grouped and ungrouped', () => {
		scene.sync(loose);
		const [a, b] = [mesh('a'), mesh('b')];
		scene.sync(grouped);
		expect(mesh('a')).toBe(a);
		expect(mesh('b')).toBe(b);
		expect(a.parent).not.toBe(scene.root);

		scene.sync(ungroupNodes(grouped, ['g']).design);
		expect(mesh('a')).toBe(a);
		expect(a.parent).toBe(scene.root);
		expect(scene.root.children.some((o) => o instanceof THREE.Group)).toBe(false);
	});

	it('removes a deleted group and frees what was inside', () => {
		scene.sync(grouped);
		let freed = 0;
		for (const id of ['a', 'b']) material(id).addEventListener('dispose', () => freed++);
		scene.sync({ ...grouped, roots: ['c'], nodes: { c: grouped.nodes.c! } });
		expect(freed).toBe(2);
		expect(allMeshes().map((m) => m.userData.nodeId)).toEqual(['c']);
		expect(scene.root.children.some((o) => o instanceof THREE.Group)).toBe(false);
	});

	it('supports groups inside groups', () => {
		const nested = groupNodes(grouped, ['g', 'c'], { id: 'outer' }).design;
		scene.sync(nested);
		expect(scene.pick(ray(0, 80))).toBe('outer');
		expect(scene.pick(ray(50, 0))).toBe('outer');
		expect(allMeshes()).toHaveLength(3);
	});
});

describe('DesignScene with a stretched group', () => {
	const stretched = (scale: [number, number, number]): Design => ({
		...grouped,
		nodes: { ...grouped.nodes, g: { ...grouped.nodes.g!, scale } as never },
	});

	it('draws the group stretched along its own axes: the group object carries the stretch', () => {
		scene.sync(stretched([2, 3, 0.5]));
		const group = scene.root.children.find((o) => o instanceof THREE.Group)!;
		expect(group.scale.toArray()).toEqual([2, 3, 0.5]);
	});

	it('is picked where it is drawn, not where it was: the sphere at x = 50 is now at x = 100, and the gap is at 50', () => {
		scene.sync(stretched([2, 1, 1]));
		scene.root.updateMatrixWorld(true);
		expect(scene.pick(ray(100, 0))).toBe('g');
		expect(scene.pick(ray(50, 0))).toBeNull();
	});

	it('is still drawn at its size when it has no stretch', () => {
		scene.sync(grouped);
		const group = scene.root.children.find((o) => o instanceof THREE.Group)!;
		expect(group.scale.toArray()).toEqual([1, 1, 1]);
	});
});
