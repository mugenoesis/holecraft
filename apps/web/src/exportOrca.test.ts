import { addPaletteColor, addShape, createEmptyDesign, renameDesign, setNodeColor, type Design } from '@holecraft/core';
import { readStoredZip, type ExportBody } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { EXPORT_FORMATS, runExport } from './exportDesign.ts';

const body = (name: string, color: string): ExportBody => ({
  name,
  color,
  mesh: { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) },
});

function design(): Design {
  let d = renameDesign(createEmptyDesign('d', 'Untitled design'), 'Colour test');
  d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
  d = setNodeColor(d, ['a'], '#2a9d8f');
  return addPaletteColor(d, '#112233');
}

const deps = () => ({ bodies: vi.fn().mockResolvedValue([body('Box 1', '#f28c28'), body('Teal', '#2a9d8f')]), save: vi.fn() });

describe('the OrcaSlicer export format', () => {
  it('is offered after the plain 3MF, and says what it is for', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['stl', 'obj', '3mf', 'orca3mf']);
    const orca = EXPORT_FORMATS.find((f) => f.id === 'orca3mf')!;
    expect(orca.label).toMatch(/Orca/);
    expect(orca.hint).toMatch(/filament|colour/i);
  });

  it('is saved with a .3mf name like any 3MF', async () => {
    const d = deps();
    await runExport(design(), 'orca3mf', d);
    const [fileName, , mime] = d.save.mock.calls[0]!;
    expect(fileName).toBe('Colour test.3mf');
    expect(mime).toBe('model/3mf');
  });

  it('writes the design\'s palette as the file\'s filaments, and gives each body the nearest one', async () => {
    const d = deps();
    await runExport(design(), 'orca3mf', d);
    const zip = readStoredZip(d.save.mock.calls[0]![1] as Uint8Array);
    const settings = JSON.parse(new TextDecoder().decode(zip.get('Metadata/project_settings.config'))) as { filament_colour: string[] };
    expect(settings.filament_colour).toEqual(['#F28C28', '#2A9D8F', '#E76F51', '#8D99AE', '#112233']);
    const config = new TextDecoder().decode(zip.get('Metadata/model_settings.config'));
    expect([...config.matchAll(/key="extruder" value="(\d+)"/g)].map((m) => m[1])).toEqual(['1', '2']);
  });

  it('leaves the plain 3MF format without any of that', async () => {
    const d = deps();
    await runExport(design(), '3mf', d);
    expect([...readStoredZip(d.save.mock.calls[0]![1] as Uint8Array).keys()].some((n) => n.startsWith('Metadata/'))).toBe(false);
  });

  it('still says so when there is nothing to export', async () => {
    const d = { bodies: vi.fn().mockResolvedValue([]), save: vi.fn() };
    await expect(runExport(design(), 'orca3mf', d)).rejects.toThrow(/nothing to export/i);
  });
});
