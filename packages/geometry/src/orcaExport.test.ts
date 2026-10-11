import { describe, expect, it } from 'vitest';
import type { ExportBody } from './export.ts';
import { ORCA_FILAMENT_DEFAULTS } from './formats/orcaFilamentDefaults.ts';
import { readStoredZip, write3mf } from './index.ts';

const tetra = {
  positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};
const body = (name: string, color: string): ExportBody => ({ name, color, mesh: tetra });
const text = (zip: Map<string, Uint8Array>, name: string) => new TextDecoder().decode(zip.get(name));
const PALETTE = ['#f28c28', '#2a9d8f', '#e76f51', '#8d99ae'];

describe('write3mf for OrcaSlicer (with a palette)', () => {
  const orca = (bodies: ExportBody[], palette: string[] = PALETTE) => readStoredZip(write3mf(bodies, { filaments: palette }));

  it('adds the two settings files OrcaSlicer and Trident read, to an otherwise ordinary 3MF', () => {
    const zip = orca([body('A', '#f28c28')]);
    expect([...zip.keys()].sort()).toEqual(['3D/3dmodel.model', 'Metadata/model_settings.config', 'Metadata/project_settings.config', '[Content_Types].xml', '_rels/.rels']);
    expect(text(zip, '3D/3dmodel.model')).toBe(text(readStoredZip(write3mf([body('A', '#f28c28')])), '3D/3dmodel.model'));
  });

  it('writes nothing extra when there is no palette, so ordinary exports are unchanged', () => {
    expect([...readStoredZip(write3mf([body('A', '#f28c28')])).keys()].sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
  });

  it('lists the palette as the filaments, in order, as the file\'s authoritative filament colours', () => {
    const settings = JSON.parse(text(orca([body('A', '#f28c28')]), 'Metadata/project_settings.config')) as Record<string, unknown>;
    expect(settings.filament_colour).toEqual(['#F28C28', '#2A9D8F', '#E76F51', '#8D99AE']);
  });

  it('gives each object the filament slot (numbered from 1) of its colour', () => {
    const zip = orca([body('Box', '#f28c28'), body('Cylinder', '#2a9d8f'), body('Grey', '#8d99ae')]);
    const config = text(zip, 'Metadata/model_settings.config');
    const extruders = [...config.matchAll(/<object id="(\d+)">[\s\S]*?<metadata key="extruder" value="(\d+)"\/>/g)].map((m) => [m[1], m[2]]);
    expect(extruders).toEqual([
      ['2', '1'],
      ['3', '2'],
      ['4', '4'],
    ]);
  });

  it('uses the nearest filament for a colour that is not in the palette', () => {
    const zip = orca([body('Almost teal', '#2b9e90')]);
    expect(text(zip, 'Metadata/model_settings.config')).toMatch(/key="extruder" value="2"/);
  });

  it('uses the same object numbers as the model, and the bodies\' names', () => {
    const zip = orca([body('First', '#f28c28'), body('Second', '#2a9d8f')]);
    const model = text(zip, '3D/3dmodel.model');
    const config = text(zip, 'Metadata/model_settings.config');
    for (const [id, name] of [['2', 'First'], ['3', 'Second']]) {
      expect(model).toContain(`<object id="${id}"`);
      expect(config).toContain(`<object id="${id}">`);
      expect(config).toContain(`<metadata key="name" value="${name}"/>`);
    }
  });

  it('puts every object on the first plate', () => {
    const config = text(orca([body('A', '#f28c28'), body('B', '#2a9d8f')]), 'Metadata/model_settings.config');
    expect(config).toContain('<metadata key="plater_id" value="1"/>');
    expect(config.match(/<model_instance>/g)).toHaveLength(2);
    expect(config).toContain('<metadata key="object_id" value="2"/>');
    expect(config).toContain('<metadata key="object_id" value="3"/>');
  });

  it('is well-formed even with awkward names', () => {
    const config = text(orca([body('<A & "B">', '#f28c28')]), 'Metadata/model_settings.config');
    expect(config).toContain('value="&lt;A &amp; &quot;B&quot;&gt;"');
    expect(config).not.toMatch(/value="[^"]*[<&](?!amp;|lt;|gt;|quot;)[^"]*"/);
  });

  it('declares the config files in the package\'s content types', () => {
    expect(text(orca([body('A', '#f28c28')]), '[Content_Types].xml')).toContain('Extension="config"');
  });

  it('works with a single-colour palette, and a full 16', () => {
    expect(JSON.parse(text(orca([body('A', '#112233')], ['#112233']), 'Metadata/project_settings.config')).filament_colour).toEqual(['#112233']);
    const sixteen = Array.from({ length: 16 }, (_, i) => `#${(i + 16).toString(16)}0000`);
    expect(JSON.parse(text(orca([body('A', '#100000')], sixteen), 'Metadata/project_settings.config')).filament_colour).toHaveLength(16);
  });

  describe('the project settings (OrcaSlicer crashes if they are inconsistent)', () => {
    const settingsFor = (palette: string[]) => JSON.parse(text(orca([body('A', palette[0]!)], palette), 'Metadata/project_settings.config')) as Record<string, unknown>;

    it('gives every per-filament setting exactly as many entries as there are filaments', () => {
      for (const n of [1, 4, 9, 16]) {
        const palette = Array.from({ length: n }, (_, i) => `#${(i + 16).toString(16)}0000`);
        const settings = settingsFor(palette);
        expect((settings.filament_colour as string[]).length).toBe(n);
        for (const key of Object.keys(ORCA_FILAMENT_DEFAULTS)) {
          expect(Array.isArray(settings[key]), key).toBe(true);
          expect((settings[key] as string[]).length, `${key} with ${n} filaments`).toBe(n);
        }
      }
    });

    it('fills them with the OrcaSlicer preset values, the same for every filament', () => {
      const settings = settingsFor(PALETTE);
      expect(settings.filament_type).toEqual(['PLA', 'PLA', 'PLA', 'PLA']);
      for (const [key, value] of Object.entries(ORCA_FILAMENT_DEFAULTS)) expect(settings[key], key).toEqual([value, value, value, value]);
    });

    it('writes only filament settings, so opening the file never replaces the user\'s printer or print profile', () => {
      const keys = Object.keys(settingsFor(PALETTE));
      expect(keys.length).toBe(Object.keys(ORCA_FILAMENT_DEFAULTS).length + 1); // the defaults plus filament_colour
      for (const machineOrProcess of ['layer_height', 'nozzle_diameter', 'printer_model', 'sparse_infill_density', 'printable_area', 'curr_bed_type']) {
        expect(keys).not.toContain(machineOrProcess);
      }
    });

    it('has the per-filament settings the engine needs (the generated list is not empty or truncated)', () => {
      const keys = Object.keys(ORCA_FILAMENT_DEFAULTS);
      expect(keys.length).toBeGreaterThan(100);
      for (const needed of ['filament_type', 'filament_diameter', 'nozzle_temperature', 'filament_flow_ratio', 'filament_settings_id', 'fan_max_speed']) {
        expect(keys).toContain(needed);
      }
    });

    it('writes valid JSON, with upper-case colours as OrcaSlicer does', () => {
      expect(settingsFor(['#abcdef', '#012345']).filament_colour).toEqual(['#ABCDEF', '#012345']);
    });
  });

  it('refuses an empty palette', () => {
    expect(() => write3mf([body('A', '#f28c28')], { filaments: [] })).toThrow(/palette|filament/i);
  });
});
