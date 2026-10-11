// Runs in a Web Worker: loads manifold's WebAssembly once, then turns each group it is sent into a
// single mesh. Kept off the main thread so cutting a complicated group never freezes the editor.
import { evaluateGroup, loadManifold, type GroupMesh, type Subtree } from '@holecraft/geometry';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { ManifoldToplevel } from 'manifold-3d';

export interface WorkerRequest {
  id: number;
  subtree: Subtree;
}

export type WorkerResponse = { id: number; mesh: GroupMesh | null } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

let ready: Promise<ManifoldToplevel> | undefined;

scope.onmessage = async ({ data }) => {
  try {
    ready ??= loadManifold(() => wasmUrl);
    const manifold = await ready;
    const mesh = evaluateGroup(manifold, data.subtree, data.subtree.rootId);
    // Hand the buffers over rather than copying them.
    scope.postMessage({ id: data.id, mesh }, mesh ? [mesh.positions.buffer, mesh.indices.buffer] : []);
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
