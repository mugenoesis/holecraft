import type { Design, MeshData } from '@holecraft/core';
import type { ExportBody } from '@holecraft/geometry';
import type { WorkerRequest, WorkerResponse } from './geometry.worker.ts';

/**
 * Works out everything to export, in a Web Worker of its own that is shut down afterwards. Exporting
 * is rare and has to wait for the whole design, so a short-lived worker (which loads the WebAssembly
 * again) keeps it clear of the editor's live preview worker.
 */
export function exportBodiesInWorker(design: Design, meshes: ReadonlyMap<string, MeshData>): Promise<ExportBody[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => worker.terminate();

    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      finish();
      if ('error' in data) reject(new Error(data.error));
      else if ('bodies' in data) resolve(data.bodies);
      else reject(new Error('The geometry worker sent an unexpected reply'));
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'The geometry worker stopped unexpectedly'));
    };

    const request: WorkerRequest = { kind: 'export', id: 1, design: { nodes: design.nodes, roots: design.roots }, meshes };
    worker.postMessage(request);
  });
}
