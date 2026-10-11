import {
  addShape,
  createEmptyDesign,
  groupNodes,
  moveNodes,
  setNodeEuler,
  setNodeMode,
  setShapeSize,
  type Design,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { loadManifold } from './load.ts';
import type { GroupMesh } from './types.ts';

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await loadManifold();
});

/** Volume of a closed triangle mesh (signed tetrahedra against the origin). */
function volume(mesh: GroupMesh): number {
  const p = mesh.positions;
  let sum = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
    sum +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6;
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

const within = (actual: number, expected: number, fraction = 0.01) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * fraction);

/** A 20 mm box at the origin and a 10 x 10 x 40 cylinder through its middle, both in group 'g'. */
function boxWithCylinder(mode: 'solid' | 'hole'): Design {
  let d = createEmptyDesign('d');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
  d = setShapeSize(d, 'h', { width: 10, depth: 10, height: 40 });
  d = setNodeMode(d, ['h'], mode);
  return groupNodes(d, ['a', 'h'], { id: 'g' }).design;
}

const CYLINDER_AREA = 0.5 * 64 * 25 * Math.sin((2 * Math.PI) / 64); // a 64-sided polygon of radius 5

describe('evaluateGroup', () => {
  it('makes a single box from a group of one solid and nothing else', () => {
    let d = createEmptyDesign('d');
    d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
    d = addShape(d, 'box', [100, 0], { id: 'b' }).design;
    d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
    d = setNodeMode(d, ['b'], 'hole'); // far away: removes nothing
    const mesh = evaluateGroup(M, d, 'g')!;
    within(volume(mesh), 8000);
    expect(bounds(mesh)).toEqual({ min: [-10, -10, 0], max: [10, 10, 20] });
  });

  it('cuts a hole through a solid', () => {
    const mesh = evaluateGroup(M, boxWithCylinder('hole'), 'g')!;
    within(volume(mesh), 8000 - CYLINDER_AREA * 20);
    // The hole leaves the outside of the box alone.
    expect(bounds(mesh)).toEqual({ min: [-10, -10, 0], max: [10, 10, 20] });
  });

  it('adds up overlapping solids instead', () => {
    const mesh = evaluateGroup(M, boxWithCylinder('solid'), 'g')!;
    // Box plus the part of the cylinder poking out above it (the part inside is not counted twice).
    within(volume(mesh), 8000 + CYLINDER_AREA * 20);
    expect(bounds(mesh).max[2]).toBeCloseTo(40, 4);
  });

  it('removes nothing when the hole is outside the solid', () => {
    let d = boxWithCylinder('hole');
    d = moveNodes(d, ['h'], [100, 0, 0]);
    within(volume(evaluateGroup(M, d, 'g')!), 8000);
  });

  it('returns null when holes eat the whole solid', () => {
    let d = createEmptyDesign('d');
    d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
    d = addShape(d, 'box', [0, 0], { id: 'big' }).design;
    d = setShapeSize(d, 'big', { width: 100, depth: 100, height: 100 });
    d = setNodeMode(d, ['big'], 'hole');
    d = groupNodes(d, ['a', 'big'], { id: 'g' }).design;
    expect(evaluateGroup(M, d, 'g')).toBeNull();
  });

  it('returns null for a group with no solids, or for something that is not a group', () => {
    const allHoles = setNodeMode(boxWithCylinder('hole'), ['a'], 'hole');
    expect(evaluateGroup(M, allHoles, 'g')).toBeNull();
    expect(evaluateGroup(M, boxWithCylinder('hole'), 'a')).toBeNull();
    expect(evaluateGroup(M, boxWithCylinder('hole'), 'nope')).toBeNull();
  });

  it('honours positions, sizes and rotations of the shapes inside', () => {
    let d = createEmptyDesign('d');
    d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
    d = addShape(d, 'box', [0, 50], { id: 'b' }).design;
    d = setShapeSize(d, 'a', { width: 40, depth: 10, height: 10 });
    d = setNodeEuler(d, 'a', [0, 0, 90]); // the long side now runs along Y
    d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
    const b = bounds(evaluateGroup(M, d, 'g')!);
    // a: x -5..5, y -20..20 after the turn; b: x -10..10, y 40..60.
    expect(b.min[0]).toBeCloseTo(-10, 4);
    expect(b.max[0]).toBeCloseTo(10, 4);
    expect(b.min[1]).toBeCloseTo(-20, 4);
    expect(b.max[1]).toBeCloseTo(60, 4);
  });

  it('builds cylinders and spheres to the size given, even when not round', () => {
    let d = createEmptyDesign('d');
    d = addShape(d, 'cylinder', [0, 0], { id: 'c' }).design;
    d = addShape(d, 'sphere', [100, 0], { id: 's' }).design;
    d = setShapeSize(d, 'c', { width: 30, depth: 10, height: 5 });
    d = setShapeSize(d, 's', { width: 30, depth: 10, height: 20 });
    d = groupNodes(d, ['c', 's'], { id: 'g' }).design;
    const b = bounds(evaluateGroup(M, d, 'g')!);
    expect(b.min[0]).toBeCloseTo(-15, 1);
    expect(b.max[0]).toBeCloseTo(115, 1);
    expect(b.min[1]).toBeCloseTo(-5, 1);
    expect(b.max[1]).toBeCloseTo(5, 1);
    expect(b.min[2]).toBeCloseTo(0, 4); // everything rests on the workplane
    expect(b.max[2]).toBeCloseTo(20, 1);
  });

  it('stays in the group\'s own frame: moving the group does not change the result', () => {
    const d = boxWithCylinder('hole');
    const moved = moveNodes(d, ['g'], [30, 40, 5]);
    expect(evaluateGroup(M, moved, 'g')!.positions).toEqual(evaluateGroup(M, d, 'g')!.positions);
  });

  it('supports groups inside groups, with their own transforms', () => {
    let d = boxWithCylinder('hole');
    d = addShape(d, 'box', [100, 0], { id: 'far' }).design;
    d = groupNodes(d, ['g', 'far'], { id: 'outer' }).design;
    d = moveNodes(d, ['g'], [0, 30, 0]); // slide the drilled box along Y inside the outer group
    const mesh = evaluateGroup(M, d, 'outer')!;
    within(volume(mesh), 2 * 8000 - CYLINDER_AREA * 20);
    const b = bounds(mesh);
    expect(b.min[1]).toBeCloseTo(-10, 4); // the far box
    expect(b.max[1]).toBeCloseTo(40, 4); // the drilled box, 30 mm along
  });

  it('lets a hole group cut as a whole', () => {
    let d = createEmptyDesign('d');
    d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
    d = addShape(d, 'box', [0, 0], { id: 'c1' }).design;
    d = addShape(d, 'cylinder', [0, 0], { id: 'c2' }).design;
    d = setShapeSize(d, 'c1', { width: 10, depth: 10, height: 40 });
    d = setShapeSize(d, 'c2', { width: 10, depth: 10, height: 40 });
    d = groupNodes(d, ['c1', 'c2'], { id: 'cutter' }).design;
    d = setNodeMode(d, ['cutter'], 'hole');
    d = groupNodes(d, ['a', 'cutter'], { id: 'g' }).design;
    // c1 (a 10 x 10 square through the box) already contains the cylinder, so the cut is 10 x 10 x 20.
    within(volume(evaluateGroup(M, d, 'g')!), 8000 - 10 * 10 * 20);
  });

  it('applies a hole group\'s own holes before it cuts', () => {
    let d = createEmptyDesign('d');
    d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
    d = addShape(d, 'box', [0, 0], { id: 'slab' }).design;
    d = addShape(d, 'box', [0, 0], { id: 'notch' }).design;
    d = setShapeSize(d, 'slab', { width: 10, depth: 10, height: 40 });
    d = setShapeSize(d, 'notch', { width: 10, depth: 10, height: 40 });
    d = setNodeMode(d, ['notch'], 'hole');
    d = groupNodes(d, ['slab', 'notch'], { id: 'nothing' }).design; // the notch eats the whole slab
    d = setNodeMode(d, ['nothing'], 'hole');
    d = groupNodes(d, ['a', 'nothing'], { id: 'g' }).design;
    within(volume(evaluateGroup(M, d, 'g')!), 8000); // an empty cutter changes nothing
  });

  it('does not change the design it was given', () => {
    const d = boxWithCylinder('hole');
    const before = JSON.stringify(d);
    evaluateGroup(M, d, 'g');
    expect(JSON.stringify(d)).toBe(before);
  });

  it('gives the same answer every time', () => {
    const d = boxWithCylinder('hole');
    expect(evaluateGroup(M, d, 'g')!.positions).toEqual(evaluateGroup(M, d, 'g')!.positions);
  });

  it('produces a closed, outward-facing mesh (positive volume)', () => {
    expect(volume(evaluateGroup(M, boxWithCylinder('hole'), 'g')!)).toBeGreaterThan(0);
  });

  it('keeps working after many evaluations (nothing is left allocated)', () => {
    const d = boxWithCylinder('hole');
    for (let i = 0; i < 60; i++) evaluateGroup(M, d, 'g');
    expect(evaluateGroup(M, d, 'g')).not.toBeNull();
  });
});
