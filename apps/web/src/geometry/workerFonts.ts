import { fontsUsedBy } from '@holecraft/core';
import type { WorkerRequest } from './geometry.worker.ts';

/** The fonts a request to the geometry worker needs loaded before it is worked out (the worker loads its own copy of each, the first time). */
export function fontsNeededBy(request: WorkerRequest): number[] {
	switch (request.kind) {
		case 'group':
		case 'edges':
			return fontsUsedBy(request.subtree.nodes);
		case 'export':
		case 'engrave':
			return fontsUsedBy(request.design.nodes);
		default:
			return [];
	}
}
