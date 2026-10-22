import type { Design, MeshData } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import type { EngraveRequest } from '../engraveJob.ts';
import type { WorkerRequest, WorkerResponse } from './geometry.worker.ts';

/**
 * Fits lettering to a shape in a Web Worker of its own that is shut down afterwards (like an export: it is rare, and needs the whole design to
 * work out the shape beneath the words), and gives the lettering as a mesh in the world.
 */
export function engraveInWorker(design: Design, meshes: ReadonlyMap<string, MeshData>, request: EngraveRequest): Promise<GroupMesh> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
		const finish = () => worker.terminate();

		worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
			finish();
			if ('error' in data) reject(new Error(data.error));
			else if ('engraving' in data) resolve(data.engraving);
			else reject(new Error('The geometry worker sent an unexpected reply'));
		};
		worker.onerror = (event) => {
			finish();
			reject(new Error(event.message || 'The geometry worker stopped unexpectedly'));
		};

		const message: WorkerRequest = {
			kind: 'engrave',
			id: 1,
			design: { nodes: design.nodes, roots: design.roots },
			meshes,
			targetId: request.targetId,
			frame: request.frame,
			polygons: request.polygons,
			depth: request.depth,
			mode: request.mode,
			resolution: request.resolution,
		};
		worker.postMessage(message);
	});
}
