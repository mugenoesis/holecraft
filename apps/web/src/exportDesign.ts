import type { Design } from '@holecraft/core';
import { exportFileName, write3mf, writeObj, writeStl, type ExportBody } from '@holecraft/geometry';
import { downloadFile } from './download.ts';
import { exportBodiesInWorker } from './geometry/exportInWorker.ts';

export type ExportFormat = 'stl' | 'obj' | '3mf';

export const EXPORT_FORMATS: ReadonlyArray<{ id: ExportFormat; label: string; hint: string; mime: string }> = [
  { id: 'stl', label: 'STL', hint: 'Best for 3D printing', mime: 'model/stl' },
  { id: 'obj', label: 'OBJ', hint: 'Widely supported mesh', mime: 'text/plain' },
  { id: '3mf', label: '3MF', hint: 'Keeps names and colours', mime: 'model/3mf' },
];

export interface ExportDeps {
  /** Works out what to print: each solid with its holes cut, in the world. */
  bodies: (design: Design) => Promise<ExportBody[]>;
  save: (fileName: string, data: Uint8Array | string, mime: string) => void;
}

const defaultDeps: ExportDeps = { bodies: exportBodiesInWorker, save: downloadFile };

/** True if there is at least one visible, solid, top-level shape or group, so an export could produce something. */
export function hasExportableShapes(design: Design): boolean {
  return design.roots.some((id) => {
    const node = design.nodes[id];
    return !!node && node.kind !== 'mesh' && node.mode === 'solid' && !node.hidden;
  });
}

/**
 * Exports the whole design as a file download. Throws, with a message fit to show, if there is
 * nothing to export (every solid is a hole, hidden, or has been cut away completely).
 */
export async function runExport(design: Design, format: ExportFormat, deps: ExportDeps = defaultDeps): Promise<void> {
  const bodies = await deps.bodies(design);
  if (bodies.length === 0) throw new Error('Nothing to export: there are no solid shapes in this design');

  const info = EXPORT_FORMATS.find((f) => f.id === format)!;
  const data = format === 'stl' ? writeStl(bodies) : format === 'obj' ? writeObj(bodies) : write3mf(bodies);
  deps.save(exportFileName(design.name, format), data, info.mime);
}
