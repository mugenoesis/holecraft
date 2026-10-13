import { addShape, createEmptyDesign, type Design, setNodeColor } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let design: Design;
beforeEach(() => {
	scene = new DesignScene();
	design = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
});

/** A box mesh of 12 triangles; the top (z = 2) is triangles 2 and 3. */
const box = (paint?: GroupMesh['paint']): GroupMesh => ({
	positions: new Float32Array([0, 0, 0, 5, 0, 0, 5, 3, 0, 0, 3, 0, 0, 0, 2, 5, 0, 2, 5, 3, 2, 0, 3, 2]),
	indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]),
	...(paint && { paint }),
});
const results = (mesh: GroupMesh) => new Map<string, GroupResult>([['a', { hash: 'x', mesh }]]);
const drawn = () => {
	let found: THREE.Mesh | undefined;
	scene.root.traverse((o) => {
		if (o instanceof THREE.Mesh && o.userData.isResult) found = o;
	});
	return found!;
};
const colourOfTriangle = (m: THREE.Mesh, t: number) => {
	const a = m.geometry.getAttribute('color') as THREE.BufferAttribute;
	return [0, 1, 2].map((k) => new THREE.Color(a.getX(t * 3 + k), a.getY(t * 3 + k), a.getZ(t * 3 + k)).getHexString());
};
const linear = (hex: string) => new THREE.Color(hex).getHexString(); // what the attribute holds is the same colour in the scene's working space
const paint = (t: number[], colors = ['#2a9d8f']): GroupMesh['paint'] => ({ colors, triangle: Uint16Array.from(t) });

describe('DesignScene with painted triangles', () => {
	it('colours each triangle: the painted ones in their paint, the rest in the shape’s own colour', () => {
		const own = (design.nodes.a as { color: string }).color;
		scene.sync(design, results(box(paint([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]))));
		const m = drawn();
		const attr = m.geometry.getAttribute('color') as THREE.BufferAttribute;
		expect(attr.count).toBe(36);
		for (const t of [2, 3]) for (const c of colourOfTriangle(m, t)) expect(c).toBe(new THREE.Color().setStyle('#2a9d8f').getHexString());
		for (const t of [0, 1, 4, 11]) for (const c of colourOfTriangle(m, t)) expect(c).toBe(new THREE.Color().setStyle(own).getHexString());
	});

	it('draws with the vertex colours and a white material (so the colours are not tinted twice)', () => {
		scene.sync(design, results(box(paint([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]))));
		const material = drawn().material as THREE.MeshStandardMaterial;
		expect(material.vertexColors).toBe(true);
		expect(material.color.getHexString()).toBe('ffffff');
	});

	it('uses no colour attribute and the shape’s colour for a mesh with no paint, and goes back to it when the paint goes', () => {
		scene.sync(design, results(box()));
		let material = drawn().material as THREE.MeshStandardMaterial;
		expect(drawn().geometry.getAttribute('color')).toBeUndefined();
		expect(material.vertexColors).toBe(false);
		expect(material.color.getHexString()).toBe(new THREE.Color((design.nodes.a as { color: string }).color).getHexString());
		scene.sync(design, results(box(paint([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]))));
		expect((drawn().material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
		scene.sync(design, results(box()));
		material = drawn().material as THREE.MeshStandardMaterial;
		expect(drawn().geometry.getAttribute('color')).toBeUndefined();
		expect(material.vertexColors).toBe(false);
		expect(material.color.getHexString()).not.toBe('ffffff');
	});

	it('follows the shape’s colour for the unpainted triangles when it is changed, with no new mesh from the engine', () => {
		const mesh = box(paint([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]));
		scene.sync(design, results(mesh));
		scene.sync(setNodeColor(design, ['a'], '#112233'), results(mesh));
		expect(colourOfTriangle(drawn(), 0)).toEqual(new Array(3).fill(linear('#112233')));
		expect(colourOfTriangle(drawn(), 2)).toEqual(new Array(3).fill(linear('#2a9d8f')));
	});

	it('picks the painted shape as before (the colours do not change what is hit)', () => {
		scene.sync(design, results(box(paint([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]))));
		const ray = new THREE.Raycaster(new THREE.Vector3(2, 1, 100), new THREE.Vector3(0, 0, -1));
		expect(scene.pick(ray)).toBe('a');
	});
});
