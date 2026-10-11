import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { duplicateNodes } from './edit.ts';
import { addMeshShape, decodeMesh, encodeMesh, isMeshRef, MESH_SHAPE_TYPE, normalizeMesh, signedVolume, type MeshData } from './meshShape.ts';
import { shapeBounds } from './ops.ts';
import { parseDesign } from './validate.ts';

/** A closed tetrahedron with outward-facing triangles. */
const tetra = (): MeshData => ({
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 30]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
});

const REF = 'a'.repeat(64);

describe('encodeMesh / decodeMesh', () => {
  it('round-trips a mesh exactly', () => {
    const decoded = decodeMesh(encodeMesh(tetra()));
    expect([...decoded.positions]).toEqual([...tetra().positions]);
    expect([...decoded.indices]).toEqual([...tetra().indices]);
  });

  it('works on a view into a bigger buffer (not 4-byte aligned)', () => {
    const bytes = encodeMesh(tetra());
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    expect([...decodeMesh(padded.subarray(3)).indices]).toEqual([...tetra().indices]);
  });

  it('rejects data that is not a mesh', () => {
    expect(() => decodeMesh(new Uint8Array(40))).toThrow(/mesh/i);
    expect(() => decodeMesh(new Uint8Array(2))).toThrow(/mesh/i);
  });

  it('rejects a truncated or padded mesh', () => {
    const bytes = encodeMesh(tetra());
    expect(() => decodeMesh(bytes.subarray(0, bytes.length - 4))).toThrow(/mesh/i);
    expect(() => decodeMesh(new Uint8Array([...bytes, 0]))).toThrow(/mesh/i);
  });

  it('rejects triangles that point at corners that do not exist', () => {
    const bad = tetra();
    bad.indices[0] = 99;
    expect(() => decodeMesh(encodeMesh(bad))).toThrow(/mesh/i);
  });

  it('rejects numbers that are not finite', () => {
    const bad = tetra();
    bad.positions[0] = Number.NaN;
    expect(() => decodeMesh(encodeMesh(bad))).toThrow(/mesh/i);
  });
});

describe('isMeshRef', () => {
  it('accepts a 64-digit lower-case hex string only', () => {
    expect(isMeshRef(REF)).toBe(true);
    expect(isMeshRef('A'.repeat(64))).toBe(false);
    expect(isMeshRef('a'.repeat(63))).toBe(false);
    expect(isMeshRef('../etc/passwd')).toBe(false);
    expect(isMeshRef(5)).toBe(false);
  });
});

describe('normalizeMesh', () => {
  it('fits the mesh into the unit box: x and y within ±0.5, z from 0 to 1', () => {
    const { mesh, size } = normalizeMesh(tetra());
    expect(size).toEqual([10, 20, 30]);
    const xs = [...mesh.positions].filter((_, i) => i % 3 === 0);
    const ys = [...mesh.positions].filter((_, i) => i % 3 === 1);
    const zs = [...mesh.positions].filter((_, i) => i % 3 === 2);
    expect(Math.min(...xs)).toBeCloseTo(-0.5);
    expect(Math.max(...xs)).toBeCloseTo(0.5);
    expect(Math.min(...ys)).toBeCloseTo(-0.5);
    expect(Math.max(...ys)).toBeCloseTo(0.5);
    expect(Math.min(...zs)).toBeCloseTo(0);
    expect(Math.max(...zs)).toBeCloseTo(1);
  });

  it('centres a model that was made far from the origin', () => {
    const far = tetra();
    for (let i = 0; i < far.positions.length; i += 3) {
      far.positions[i]! += 500;
      far.positions[i + 1]! -= 300;
      far.positions[i + 2]! += 40;
    }
    const { mesh, size } = normalizeMesh(far);
    expect(size).toEqual([10, 20, 30]);
    expect(Math.min(...[...mesh.positions].filter((_, i) => i % 3 === 0))).toBeCloseTo(-0.5);
  });

  it('turns inside-out triangles the right way round', () => {
    const inside = tetra();
    for (let t = 0; t < inside.indices.length; t += 3) {
      const b = inside.indices[t + 1]!;
      inside.indices[t + 1] = inside.indices[t + 2]!;
      inside.indices[t + 2] = b;
    }
    expect(signedVolume(inside)).toBeLessThan(0);
    expect(signedVolume(normalizeMesh(inside).mesh)).toBeGreaterThan(0);
  });

  it('leaves correctly wound triangles alone', () => {
    expect(signedVolume(normalizeMesh(tetra()).mesh)).toBeGreaterThan(0);
  });

  it('refuses a model with no thickness', () => {
    const flat: MeshData = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]) };
    expect(() => normalizeMesh(flat)).toThrow(/flat|thickness/i);
  });

  it('refuses a model bigger than the biggest shape allowed', () => {
    const huge = tetra();
    huge.positions[3] = 5000;
    expect(() => normalizeMesh(huge)).toThrow(/too large|1000/i);
  });
});

describe('duplicating an imported model', () => {
  const one = () => addMeshShape(createEmptyDesign('d', 'T'), { name: 'Bracket', ref: REF, size: [10, 20, 30] }, { id: 'm1' }).design;

  it('copies it, sharing the same stored mesh, named as a copy', () => {
    const { design, ids } = duplicateNodes(one(), ['m1'], [10, 10]);
    expect(ids).toHaveLength(1);
    const copy = design.nodes[ids[0]!]!;
    expect(copy).toMatchObject({ kind: 'shape', shapeType: MESH_SHAPE_TYPE, name: 'Bracket copy' });
    expect(copy.kind === 'shape' && copy.params.mesh).toBe(REF);
    expect(design.roots).toHaveLength(2);
  });

  it('numbers further copies instead of piling up "copy copy"', () => {
    let d = one();
    d = duplicateNodes(d, ['m1'], [10, 10]).design;
    const second = duplicateNodes(d, ['m1'], [20, 20]);
    expect(second.design.nodes[second.ids[0]!]!.name).toBe('Bracket copy 2');
    const third = duplicateNodes(second.design, [second.ids[0]!], [30, 30]);
    expect(third.design.nodes[third.ids[0]!]!.name).toBe('Bracket copy 3');
  });
});

describe('addMeshShape', () => {
  const base = () => createEmptyDesign('d', 'Test');

  it('adds a solid shape named after the file, at its real size, on the workplane', () => {
    const { design, id } = addMeshShape(base(), { name: 'Bracket', ref: REF, size: [10, 20, 30] }, { at: [5, -5], id: 'm1' });
    expect(id).toBe('m1');
    const node = design.nodes.m1!;
    expect(node).toMatchObject({ kind: 'shape', shapeType: MESH_SHAPE_TYPE, name: 'Bracket', mode: 'solid' });
    expect(node.kind === 'shape' && node.params).toMatchObject({ width: 10, depth: 20, height: 30, mesh: REF });
    expect(design.roots).toEqual(['m1']);
    const bounds = shapeBounds(node as never);
    expect(bounds.min).toEqual([0, -15, 0]);
    expect(bounds.max).toEqual([10, 5, 30]);
  });

  it('remembers the original size, so a resize can be undone by hand', () => {
    const { design } = addMeshShape(base(), { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1' });
    expect(design.nodes.m1!.kind === 'shape' && design.nodes.m1!.params).toMatchObject({ originalWidth: 10, originalDepth: 20, originalHeight: 30 });
  });

  it('does not change the design it was given', () => {
    const d = base();
    addMeshShape(d, { name: 'Part', ref: REF, size: [1, 1, 1] }, { id: 'm1' });
    expect(d.roots).toEqual([]);
  });

  it('survives being saved and loaded', () => {
    const { design } = addMeshShape(base(), { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1' });
    const loaded = parseDesign(JSON.parse(JSON.stringify(design)));
    expect(loaded.nodes.m1).toEqual(design.nodes.m1);
  });

  it('is refused on load when the mesh reference is not a proper one', () => {
    const { design } = addMeshShape(base(), { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1' });
    const bad = JSON.parse(JSON.stringify(design));
    bad.nodes.m1.params.mesh = '../../secret';
    expect(() => parseDesign(bad)).toThrow(/mesh/i);
    delete bad.nodes.m1.params.mesh;
    expect(() => parseDesign(bad)).toThrow(/mesh/i);
  });
});
