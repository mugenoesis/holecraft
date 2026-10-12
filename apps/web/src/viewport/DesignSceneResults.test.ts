import { addShape, createEmptyDesign, type Design, groupNodes, moveNodes, setNodeColor, setNodeMode } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GroupResult } from '../geometry/GeometryService.ts';
import { DesignScene } from './DesignScene.ts';

let scene: DesignScene;
let design: Design;

/** An axis-aligned box mesh from (0,0,0) to (w,d,h): 8 corners, 12 triangles. */
function boxMesh(w: number, d: number, h: number): GroupMesh {
	const positions = new Float32Array([0, 0, 0, w, 0, 0, w, d, 0, 0, d, 0, 0, 0, h, w, 0, h, w, d, h, 0, d, h]);
	const indices = new Uint32Array([
		0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
	]);
	return { positions, indices };
}

const result = (mesh: GroupMesh | null, hash = 'h1'): GroupResult => ({ hash, mesh });
const results = (id: string, r: GroupResult) => new Map([[id, r]]);

beforeEach(() => {
	scene = new DesignScene();
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'sphere', [50, 0], { id: 'b' }).design;
	d = addShape(d, 'cylinder', [0, 80], { id: 'c' }).design;
	design = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
});

const meshes = () => {
	const out: THREE.Mesh[] = [];
	scene.root.traverse((o) => o instanceof THREE.Mesh && out.push(o));
	return out;
};
const resultMeshes = () => meshes().filter((m) => m.userData.isResult);
const shape = (id: string) => meshes().find((m) => m.userData.nodeId === id)!;
const ray = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1));

describe('DesignScene with a computed hole group', () => {
	const asHole = () => setNodeMode(design, ['g'], 'hole');
	const material = (m: THREE.Mesh) => m.material as THREE.MeshStandardMaterial;

	it('draws the finished shape as one ghost, not every shape it was made from', () => {
		scene.sync(asHole(), results('g', result(boxMesh(30, 20, 10))));
		expect(resultMeshes()).toHaveLength(1);
		expect(resultMeshes()[0]!.visible).toBe(true);
		expect(shape('a').visible).toBe(false);
		expect(shape('b').visible).toBe(false);
	});

	it('looks like any hole: pale, see-through and not hiding what is behind it', () => {
		scene.sync(setNodeColor(asHole(), ['g'], '#336699'), results('g', result(boxMesh(30, 20, 10))));
		const m = material(resultMeshes()[0]!);
		expect(m.transparent).toBe(true);
		expect(m.opacity).toBeCloseTo(0.35, 2);
		expect(m.depthWrite).toBe(false);
		expect(m.color.getHexString()).not.toBe('336699');
	});

	it('goes solid again, in its colour, when it is turned back to a solid', () => {
		scene.sync(asHole(), results('g', result(boxMesh(30, 20, 10))));
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		const m = material(resultMeshes()[0]!);
		expect(m.transparent).toBe(false);
		expect(m.opacity).toBe(1);
		expect(m.depthWrite).toBe(true);
	});

	it('can still be picked where the finished shape is, and not where it has been cut away', () => {
		scene.sync(asHole(), results('g', result(boxMesh(30, 20, 10))));
		expect(scene.pick(ray(15, 10))).toBe('g');
		expect(scene.pick(ray(45, 10))).toBeNull();
	});

	it('falls back to the ghosts of its shapes while the finished shape is being worked out', () => {
		scene.sync(asHole());
		expect(resultMeshes()).toHaveLength(0);
		expect(shape('a').visible).toBe(true);
		expect(material(shape('a')).transparent).toBe(true);
	});
});

describe('DesignScene with computed group shapes', () => {
	it('draws the group as its computed mesh and hides the shapes it was made from', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		expect(resultMeshes()).toHaveLength(1);
		expect(resultMeshes()[0]!.visible).toBe(true);
		expect(shape('a').visible).toBe(false);
		expect(shape('b').visible).toBe(false);
		expect(shape('c').visible).toBe(true); // outside the group
	});

	it("uses the group's colour", () => {
		const recoloured = setNodeColor(design, ['g'], '#336699');
		scene.sync(recoloured, results('g', result(boxMesh(30, 20, 10))));
		const material = resultMeshes()[0]!.material as THREE.MeshStandardMaterial;
		expect(material.color.getHexString()).toBe('336699');
	});

	it('builds a mesh with the vertices it was given and smooth-where-gentle normals', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		const geometry = resultMeshes()[0]!.geometry;
		geometry.computeBoundingBox();
		expect(geometry.boundingBox!.min.toArray()).toEqual([0, 0, 0]);
		expect(geometry.boundingBox!.max.toArray()).toEqual([30, 20, 10]);
		expect(geometry.getAttribute('normal')).toBeDefined();
	});

	it('shows the original shapes while the result is still being worked out', () => {
		scene.sync(design);
		expect(resultMeshes()).toHaveLength(0);
		expect(shape('a').visible).toBe(true);
	});

	it('shows the original shapes if working the result out failed', () => {
		scene.sync(design, new Map(), new Set(['g']));
		expect(shape('a').visible).toBe(true);
		expect(resultMeshes()).toHaveLength(0);
	});

	it('shows nothing for a group the holes cut away completely', () => {
		scene.sync(design, results('g', result(null)));
		expect(resultMeshes()).toHaveLength(0);
		expect(shape('a').visible).toBe(false);
		expect(shape('b').visible).toBe(false);
		expect(scene.pick(ray(0, 0))).toBeNull();
	});

	it("puts the result in the group's own frame, so moving the group moves it", () => {
		scene.sync(moveNodes(design, ['g'], [25, 0, 0]), results('g', result(boxMesh(30, 20, 10))));
		scene.root.updateMatrixWorld(true);
		const world = new THREE.Vector3().setFromMatrixPosition(resultMeshes()[0]!.matrixWorld);
		expect(world.x).toBe(25);
	});

	it('goes back to the original shapes when the result goes away', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		scene.sync(design, new Map());
		expect(resultMeshes()).toHaveLength(0);
		expect(shape('a').visible).toBe(true);
	});
});

describe('DesignScene picking and selecting a computed group', () => {
	it('picks the computed mesh, and not the shapes hidden behind it', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		expect(scene.pick(ray(10, 10))).toBe('g');
		// Where shape b used to be (x 50): nothing is drawn there any more.
		expect(scene.pick(ray(50, 0))).toBeNull();
	});

	it('lets you pick through the hole in a computed mesh', () => {
		// A frame: four boxes round an empty middle, as a mesh with a hole through it.
		const frame: GroupMesh = { positions: new Float32Array(), indices: new Uint32Array() };
		const parts = [boxMesh(30, 10, 10), boxMesh(30, 10, 10), boxMesh(10, 30, 10)];
		const offsets = [
			[0, 0],
			[0, 20],
			[0, 0],
		];
		const positions: number[] = [];
		const indices: number[] = [];
		parts.forEach((p, i) => {
			const base = positions.length / 3;
			for (let v = 0; v < p.positions.length; v += 3)
				positions.push(p.positions[v]! + offsets[i]![0]!, p.positions[v + 1]! + offsets[i]![1]!, p.positions[v + 2]!);
			for (const idx of p.indices) indices.push(idx + base);
		});
		frame.positions = new Float32Array(positions);
		frame.indices = new Uint32Array(indices);
		scene.sync(design, results('g', result(frame)));
		expect(scene.pick(ray(5, 15))).toBe('g'); // on the left bar
		expect(scene.pick(ray(20, 15))).toBeNull(); // in the opening
	});

	it('tints the computed mesh and outlines its bounding box when selected', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		scene.setSelection(['g']);
		const mesh = resultMeshes()[0]!;
		expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHex()).not.toBe(0);
		const outline = mesh.getObjectByName('selection-outline')!;
		expect(outline.visible).toBe(true);
		expect(outline.scale.toArray()).toEqual([30, 20, 10]);
		expect(outline.position.toArray()).toEqual([15, 10, 0]);
	});

	it('keeps the selection tint when a new result replaces the old one', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10), 'h1')));
		scene.setSelection(['g']);
		scene.sync(design, results('g', result(boxMesh(40, 20, 10), 'h2')));
		const mesh = resultMeshes()[0]!;
		expect((mesh.material as THREE.MeshStandardMaterial).emissive.getHex()).not.toBe(0);
		expect(mesh.getObjectByName('selection-outline')!.scale.x).toBe(40);
	});

	it('marquee-selects a computed group by its mesh, not by the shapes hidden behind it', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 20000);
		camera.up.set(0, 0, 1);
		camera.position.set(0, -0.001, 400);
		camera.lookAt(0, 0, 0);
		camera.updateMatrixWorld();
		// Over x = 50 (where shape b used to be) there is nothing to select any more.
		const x50 = 50 / (400 * Math.tan((20 * Math.PI) / 180));
		expect(scene.idsInRect(camera, { minX: x50 - 0.01, maxX: x50 + 0.01, minY: -0.01, maxY: 0.01 })).toEqual([]);
		expect(scene.idsInRect(camera, { minX: -0.01, maxX: 0.06, minY: -0.01, maxY: 0.06 })).toEqual(['g']);
	});
});

describe('DesignScene result bookkeeping', () => {
	it('reuses the geometry while the result is unchanged', () => {
		const r = result(boxMesh(30, 20, 10));
		scene.sync(design, results('g', r));
		const first = resultMeshes()[0]!.geometry;
		scene.sync(design, results('g', r));
		scene.sync(moveNodes(design, ['g'], [5, 0, 0]), results('g', r));
		expect(resultMeshes()[0]!.geometry).toBe(first);
	});

	it('swaps the geometry and frees the old one when the result changes', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10), 'h1')));
		const old = resultMeshes()[0]!.geometry;
		let freed = false;
		old.addEventListener('dispose', () => (freed = true));
		scene.sync(design, results('g', result(boxMesh(40, 20, 10), 'h2')));
		expect(freed).toBe(true);
		expect(resultMeshes()).toHaveLength(1);
	});

	it('frees a result when its group is deleted', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		const mesh = resultMeshes()[0]!;
		let geometryFreed = false;
		let materialFreed = false;
		mesh.geometry.addEventListener('dispose', () => (geometryFreed = true));
		(mesh.material as THREE.Material).addEventListener('dispose', () => (materialFreed = true));
		scene.sync({ ...design, roots: ['c'], nodes: { c: design.nodes.c! } }, new Map());
		expect(geometryFreed && materialFreed).toBe(true);
		expect(resultMeshes()).toHaveLength(0);
	});

	it('frees everything on dispose', () => {
		scene.sync(design, results('g', result(boxMesh(30, 20, 10))));
		const mesh = resultMeshes()[0]!;
		let freed = false;
		mesh.geometry.addEventListener('dispose', () => (freed = true));
		scene.dispose();
		expect(freed).toBe(true);
	});
});

describe('a single shape drawn from its computed mesh (it has treated edges)', () => {
	/** Shape c (a cylinder at (0, 80)) stood in for by a 10 mm cube from its base centre up, in its own frame. */
	const own = () => {
		const m = boxMesh(10, 10, 10);
		for (let i = 0; i < m.positions.length; i += 3) {
			m.positions[i] = m.positions[i]! - 5;
			m.positions[i + 1] = m.positions[i + 1]! - 5;
		}
		return m;
	};

	it('hides the plain shape and draws the result where the shape is', () => {
		scene.sync(design, results('c', result(own())));
		expect(shape('c').visible).toBe(false);
		const drawn = resultMeshes().find((m) => m.userData.nodeId === 'c')!;
		expect(drawn.visible).toBe(true);
		expect(scene.pick(ray(0, 80))).toBe('c');
		expect(scene.pick(ray(8, 80))).toBeNull(); // the plain 20 mm cylinder would reach here; the 10 mm result does not
	});

	it('follows the shape when it moves, without needing a new result', () => {
		scene.sync(moveNodes(design, ['c'], [30, 0, 0]), results('c', result(own())));
		expect(scene.pick(ray(30, 80))).toBe('c');
		expect(scene.pick(ray(0, 80))).toBeNull();
	});

	it('goes back to the plain shape when the result goes away', () => {
		scene.sync(design, results('c', result(own())));
		scene.sync(design);
		expect(shape('c').visible).toBe(true);
		expect(resultMeshes().filter((m) => m.userData.nodeId === 'c')).toHaveLength(0);
	});

	it('ignores a result for a shape inside a group (only top-level ones are drawn on their own)', () => {
		scene.sync(design, results('a', result(own())));
		expect(resultMeshes().filter((m) => m.userData.nodeId === 'a')).toHaveLength(0);
	});
});
