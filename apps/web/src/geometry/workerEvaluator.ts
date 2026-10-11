import type { GroupMesh, Subtree } from '@holecraft/geometry';
import type { Evaluator } from './GeometryService.ts';
import type { WorkerRequest, WorkerResponse } from './geometry.worker.ts';

export interface WorkerEvaluator {
  evaluate: Evaluator;
  dispose(): void;
}

interface Pending {
  resolve: (mesh: GroupMesh | null) => void;
  reject: (error: Error) => void;
}

/**
 * An Evaluator backed by the geometry Web Worker. The worker (and the WebAssembly download) is only
 * started when the first group needs working out, and is started afresh if it ever crashes.
 */
export function createWorkerEvaluator(): WorkerEvaluator {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const failAll = (error: Error) => {
    for (const p of pending.values()) p.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  const start = (): Worker => {
    const w = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if ('error' in data) job.reject(new Error(data.error));
      else if ('mesh' in data) job.resolve(data.mesh);
      else job.reject(new Error('The geometry worker sent an unexpected reply'));
    };
    w.onerror = (event) => failAll(new Error(event.message || 'The geometry worker stopped unexpectedly'));
    return w;
  };

  return {
    evaluate: (subtree: Subtree) =>
      new Promise((resolve, reject) => {
        worker ??= start();
        const id = nextId++;
        pending.set(id, { resolve, reject });
        const request: WorkerRequest = { kind: 'group', id, subtree };
        worker.postMessage(request);
      }),
    dispose: () => failAll(new Error('The geometry worker was shut down')),
  };
}
