import {
  addMeshShape,
  addShape,
  createEmptyDesign,
  groupNodes,
  moveNodes,
  normalizeMesh,
  setNodeMode,
  setShapeSize,
  type Design,
  type MeshData,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { collectBodies, evaluateNode } from './export.ts';
import { loadManifold } from './load.ts';
import { meshRefsIn } from './subtree.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await loadManifold();
});

const REF = 'b'.repeat(64);

/** A closed box mesh with outward triangles, x/y/z from 0 to s. */
function boxMesh(s: number): MeshData {
  const positions = new Float32Array([0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}

function volume(mesh: GroupMesh): number {
  const p = mesh.positions;
  let sum = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
    sum += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6;
  }
  return sum;
}

function bounds(mesh: GroupMesh) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
      max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
    }
  }
  return { min, max };
}

/** A design with one imported 20 mm cube, plus the mesh table that goes with it. */
function withCube(): { design: Design; meshes: Map<string, MeshData>; id: string } {
  const { mesh, size } = normalizeMesh(boxMesh(20));
  const { design, id } = addMeshShape(createEmptyDesign('d', 'T'), { name: 'Part', ref: REF, size }, { id: 'm' });
  return { design, id, meshes: new Map([[REF, mesh]]) };
}

describe('imported meshes as shapes', () => {
  it('is placed and sized like any shape when exported on its own', () => {
    const { design, meshes } = withCube();
    let d = setShapeSize(design, 'm', { width: 40, depth: 10, height: 10 });
    d = moveNodes(d, ['m'], [30, 0, 5]);
    const mesh = evaluateNode(M, d, 'm', meshes)!;
    expect(volume(mesh)).toBeCloseTo(4000, 2);
    const b = bounds(mesh);
    expect(b.min[0]).toBeCloseTo(10, 3);
    expect(b.max[0]).toBeCloseTo(50, 3);
    expect(b.min[2]).toBeCloseTo(5, 3);
    expect(b.max[2]).toBeCloseTo(15, 3);
  });

  it('can have a hole cut through it', () => {
    const { design, meshes } = withCube();
    let d = addShape(design, 'cylinder', [0, 0], { id: 'h' }).design;
    d = setShapeSize(d, 'h', { width: 10, depth: 10, height: 40 });
    d = setNodeMode(d, ['h'], 'hole');
    d = groupNodes(d, ['m', 'h'], { id: 'g' }).design;
    const bore = 0.5 * 64 * 25 * Math.sin((2 * Math.PI) / 64) * 20;
    const mesh = evaluateGroup(M, d, 'g', meshes)!;
    expect(Math.abs(volume(mesh) - (8000 - bore))).toBeLessThan(5);
  });

  it('can be the hole that cuts another shape', () => {
    const { design, meshes } = withCube();
    let d = setNodeMode(design, ['m'], 'hole');
    d = addShape(d, 'box', [0, 0], { id: 'b' }).design;
    d = setShapeSize(d, 'b', { width: 40, depth: 40, height: 20 });
    d = groupNodes(d, ['b', 'm'], { id: 'g' }).design;
    const mesh = evaluateGroup(M, d, 'g', meshes)!;
    expect(volume(mesh)).toBeCloseTo(40 * 40 * 20 - 8000, 1);
  });

  it('is included in an export, with its name', () => {
    const { design, meshes } = withCube();
    const bodies = collectBodies(M, design, meshes);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.name).toBe('Part');
    expect(volume(bodies[0]!.mesh)).toBeCloseTo(8000, 2);
  });

  it('says which model is missing when its data has not arrived', () => {
    const { design } = withCube();
    expect(() => evaluateNode(M, design, 'm', new Map())).toThrow(/Part.*missing|missing.*Part/i);
  });

  it('says so when a model has holes in its surface and cannot be cut', () => {
    const open = boxMesh(20);
    open.indices = open.indices.slice(0, open.indices.length - 6); // drop the last two triangles
    const { mesh, size } = normalizeMesh(open);
    const { design } = addMeshShape(createEmptyDesign('d', 'T'), { name: 'Leaky', ref: REF, size }, { id: 'm' });
    expect(() => evaluateNode(M, design, 'm', new Map([[REF, mesh]]))).toThrow(/Leaky.*watertight|watertight.*Leaky/i);
  });

  it('frees everything it made, even when it fails', () => {
    const { design } = withCube();
    for (let i = 0; i < 50; i++) expect(() => evaluateNode(M, design, 'm', new Map())).toThrow();
  });
});

describe('meshRefsIn', () => {
  it('lists the stored meshes a group or shape needs, once each', () => {
    const { design } = withCube();
    let d = addMeshShape(design, { name: 'Again', ref: REF, size: [1, 1, 1] }, { id: 'm2' }).design;
    d = addShape(d, 'box', [0, 0], { id: 'b' }).design;
    d = groupNodes(d, ['m', 'm2', 'b'], { id: 'g' }).design;
    expect(meshRefsIn(d, ['g'])).toEqual([REF]);
    expect(meshRefsIn(d, ['b'])).toEqual([]);
  });
});
