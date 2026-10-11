import { addMeshShape, addShape, createEmptyDesign, normalizeMesh, type Design, type MeshData } from '@holecraft/core';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignScene } from './DesignScene.ts';

const REF = 'c'.repeat(64);
const OTHER = 'd'.repeat(64);

/** A tetrahedron, fitted to the unit box like a real import. */
const unitTetra = (): MeshData =>
  normalizeMesh({
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 30]),
    indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
  }).mesh;

let scene: DesignScene;
let design: Design;

beforeEach(() => {
  scene = new DesignScene();
  let d = createEmptyDesign('d');
  d = addMeshShape(d, { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1', at: [0, 0] }).design;
  d = addMeshShape(d, { name: 'Part 2', ref: REF, size: [5, 5, 5] }, { id: 'm2', at: [50, 0] }).design;
  d = addShape(d, 'box', [0, 80], { id: 'b' }).design;
  design = d;
});

const meshOf = (id: string) => {
  let found: THREE.Mesh | undefined;
  scene.root.traverse((o) => o instanceof THREE.Mesh && o.userData.nodeId === id && (found = o));
  return found!;
};

describe('DesignScene with imported models', () => {
  it('draws a stand-in box until the model has arrived', () => {
    scene.sync(design);
    const mesh = meshOf('m1');
    expect(mesh.visible).toBe(true);
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(mesh.scale.toArray()).toEqual([10, 20, 30]);
  });

  it('swaps in the real model when it arrives', () => {
    scene.sync(design);
    const standIn = meshOf('m1').geometry;
    scene.sync(design, undefined, undefined, new Map([[REF, unitTetra()]]));
    const real = meshOf('m1').geometry;
    expect(real).not.toBe(standIn);
    expect(real.getAttribute('position').count).toBe(12); // 4 triangles, three corners each
  });

  it('scales it by the shape size, like any other shape', () => {
    scene.sync(design, undefined, undefined, new Map([[REF, unitTetra()]]));
    expect(meshOf('m1').scale.toArray()).toEqual([10, 20, 30]);
    expect(meshOf('m2').scale.toArray()).toEqual([5, 5, 5]);
  });

  it('shares one geometry between shapes that use the same stored model', () => {
    scene.sync(design, undefined, undefined, new Map([[REF, unitTetra()]]));
    expect(meshOf('m1').geometry).toBe(meshOf('m2').geometry);
  });

  it('keeps the same geometry on later syncs with the same model', () => {
    const table = new Map([[REF, unitTetra()]]);
    scene.sync(design, undefined, undefined, table);
    const first = meshOf('m1').geometry;
    scene.sync(design, undefined, undefined, table);
    expect(meshOf('m1').geometry).toBe(first);
  });

  it('can be hit by a ray, so it can be picked', () => {
    scene.sync(design, undefined, undefined, new Map([[REF, unitTetra()]]));
    scene.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(-2, -2, 100), new THREE.Vector3(0, 0, -1));
    expect(scene.pick(ray)).toBe('m1');
  });

  it('does not disturb ordinary shapes', () => {
    scene.sync(design, undefined, undefined, new Map([[OTHER, unitTetra()]]));
    expect(meshOf('b').geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});
