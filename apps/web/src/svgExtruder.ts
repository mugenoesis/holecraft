import type { MeshData } from '@holecraft/core';
import { createWorkerEvaluator, type WorkerEvaluator } from './geometry/workerEvaluator.ts';

let worker: WorkerEvaluator | null = null;

/** Extrudes an SVG in a geometry worker of its own, started the first time one is imported (the editor's worker is its own business). */
export function extrudeSvg(text: string, depth: number): Promise<MeshData> {
	worker ??= createWorkerEvaluator();
	return worker.svg(text, depth);
}
