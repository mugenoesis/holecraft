import { addShape, createEmptyDesign, renameDesign, type Design } from '@holecraft/core';
import type { ExportBody } from '@holecraft/geometry';
import { readStoredZip } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { EXPORT_FORMATS, hasExportableShapes, runExport } from './exportDesign.ts';

const body = (name = 'Box 1'): ExportBody => ({
  name,
  color: '#f28c28',
  mesh: { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) },
});

function design(name = 'Bracket'): Design {
  return renameDesign(createEmptyDesign('d', 'Untitled design'), name);
}

function deps(bodies: ExportBody[] = [body()]) {
  return { bodies: vi.fn().mockResolvedValue(bodies), save: vi.fn() };
}

describe('EXPORT_FORMATS', () => {
  it('offers STL, OBJ and 3MF, each with a file extension', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['stl', 'obj', '3mf']);
    for (const f of EXPORT_FORMATS) expect(f.label.length).toBeGreaterThan(0);
  });
});

describe('runExport', () => {
  it('builds the file and hands it to be saved, named after the design', async () => {
    const d = deps();
    await runExport(design('Bracket'), 'stl', d);
    expect(d.save).toHaveBeenCalledTimes(1);
    const [fileName, data, mime] = d.save.mock.calls[0]!;
    expect(fileName).toBe('Bracket.stl');
    expect(mime).toBe('model/stl');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(new DataView((data as Uint8Array).buffer).getUint32(80, true)).toBe(4);
  });

  it('writes OBJ as text', async () => {
    const d = deps();
    await runExport(design(), 'obj', d);
    const [fileName, data, mime] = d.save.mock.calls[0]!;
    expect(fileName).toBe('Bracket.obj');
    expect(mime).toBe('text/plain');
    expect(String(data)).toContain('o Box 1');
  });

  it('writes 3MF as a zip', async () => {
    const d = deps();
    await runExport(design(), '3mf', d);
    const [fileName, data, mime] = d.save.mock.calls[0]!;
    expect(fileName).toBe('Bracket.3mf');
    expect(mime).toBe('model/3mf');
    expect(readStoredZip(data as Uint8Array).has('3D/3dmodel.model')).toBe(true);
  });

  it('makes the file name safe', async () => {
    const d = deps();
    await runExport(design('a/b:c'), 'stl', d);
    expect(d.save.mock.calls[0]![0]).toBe('a-b-c.stl');
  });

  it('gives the design to the geometry worker', async () => {
    const d = deps();
    const doc = addShape(design(), 'box', [0, 0]).design;
    await runExport(doc, 'stl', d);
    expect(d.bodies).toHaveBeenCalledWith(doc);
  });

  it('says so, and saves nothing, when nothing is left to export', async () => {
    const d = deps([]);
    await expect(runExport(design(), 'stl', d)).rejects.toThrow(/nothing to export/i);
    expect(d.save).not.toHaveBeenCalled();
  });

  it('passes on a failure from the worker', async () => {
    const d = { bodies: vi.fn().mockRejectedValue(new Error('worker crashed')), save: vi.fn() };
    await expect(runExport(design(), 'stl', d)).rejects.toThrow('worker crashed');
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe('hasExportableShapes', () => {
  it('is false for an empty design', () => {
    expect(hasExportableShapes(design())).toBe(false);
  });

  it('is true once there is a visible solid shape', () => {
    expect(hasExportableShapes(addShape(design(), 'box', [0, 0]).design)).toBe(true);
  });

  it('is false when everything is a hole or hidden', () => {
    const d = addShape(design(), 'box', [0, 0], { id: 'a' }).design;
    d.nodes.a!.mode = 'hole';
    expect(hasExportableShapes(d)).toBe(false);
    d.nodes.a!.mode = 'solid';
    d.nodes.a!.hidden = true;
    expect(hasExportableShapes(d)).toBe(false);
  });
});
