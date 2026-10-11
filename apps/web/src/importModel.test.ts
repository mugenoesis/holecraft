import type { MeshData } from '@holecraft/core';
import { writeObj, writeStl } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_ACCEPT, importModelFile } from './importModel.ts';

const REF = 'a'.repeat(64);
const tetra = {
  positions: new Float32Array([100, 100, 5, 110, 100, 5, 100, 120, 5, 100, 100, 35]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};
const body = { name: 'x', color: '#ffffff', mesh: tetra };

const file = (name: string, bytes: Uint8Array | string) => {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return { name, size: data.length, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer };
};
const deps = () => ({ upload: vi.fn(async (_m: MeshData) => REF) });

describe('importModelFile', () => {
  it('reads an STL, stores it, and describes the shape to add', async () => {
    const d = deps();
    const { input } = await importModelFile(file('Bracket.stl', writeStl([body])), d);
    expect(input).toEqual({ name: 'Bracket', ref: REF, size: [10, 20, 30] });
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it('stores the model fitted to the unit box, however far from the origin it was made', async () => {
    const d = deps();
    const { mesh } = await importModelFile(file('a.stl', writeStl([body])), d);
    expect(Math.max(...mesh.positions)).toBeCloseTo(1);
    expect(Math.min(...mesh.positions)).toBeCloseTo(-0.5);
    expect(d.upload.mock.calls[0]![0]).toBe(mesh);
  });

  it('reads OBJ files too', async () => {
    const { input } = await importModelFile(file('m.obj', writeObj([body])), deps());
    expect(input.size).toEqual([10, 20, 30]);
  });

  it('says what it can read when given something else', async () => {
    await expect(importModelFile(file('notes.txt', 'hi'), deps())).rejects.toThrow(/STL, OBJ or 3MF/);
  });

  it('says so when a model has no thickness, and stores nothing', async () => {
    const d = deps();
    const flat = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]) };
    await expect(importModelFile(file('flat.stl', writeStl([{ ...body, mesh: flat }])), d)).rejects.toThrow(/flat/i);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('refuses very large files before reading them', async () => {
    const big = { name: 'big.stl', size: 200 * 1024 * 1024, arrayBuffer: vi.fn() };
    await expect(importModelFile(big, deps())).rejects.toThrow(/too large/i);
    expect(big.arrayBuffer).not.toHaveBeenCalled();
  });

  it('passes on a failure to store the model', async () => {
    const d = { upload: vi.fn(async () => Promise.reject(new Error('Could not reach the server'))) };
    await expect(importModelFile(file('a.stl', writeStl([body])), d)).rejects.toThrow('Could not reach the server');
  });
});

describe('IMPORT_ACCEPT', () => {
  it('lists the file types the picker should offer', () => {
    expect(IMPORT_ACCEPT).toBe('.stl,.obj,.3mf');
  });
});
