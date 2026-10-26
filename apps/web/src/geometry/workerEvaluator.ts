import type { Design, MeshData, MeshEdge, NodeId } from '@holecraft/core';
import type { ClosedCavity, GroupMesh, RawMesh, Subtree } from '@holecraft/geometry';
import type { Evaluator } from './GeometryService.ts';
import type { WorkerRequest, WorkerResponse } from './geometry.worker.ts';

export interface WorkerEvaluator {
	evaluate: Evaluator;
	/** The edges the Edge tool offers on the subtree's root (see `toolEdges`), or with `treated`, those of its finished shape. */
	edges(subtree: Subtree, meshes: ReadonlyMap<string, MeshData>, treated?: boolean): Promise<MeshEdge[]>;
	/** An SVG's filled shapes extruded `depth` mm into a solid (see `svgToMesh`). Rejects with a message fit to show. */
	svg(text: string, depth: number): Promise<RawMesh>;
	/** Every closed cavity of a top-level shape as it stands on the plane, largest first, with the solid that fills each (see `findClosedCavities`). */
	cavities(design: Pick<Design, 'nodes' | 'roots'>, id: NodeId, meshes: ReadonlyMap<string, MeshData>): Promise<ClosedCavity[]>;
	dispose(): void;
}

interface Pending {
	resolve: (reply: WorkerResponse) => void;
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
			else job.resolve(data);
		};
		w.onerror = (event) => failAll(new Error(event.message || 'The geometry worker stopped unexpectedly'));
		return w;
	};

	/** Sends a request and waits for its reply (an error reply rejects). */
	const ask = (request: (id: number) => WorkerRequest): Promise<WorkerResponse> =>
		new Promise((resolve, reject) => {
			worker ??= start();
			const id = nextId++;
			pending.set(id, { resolve, reject });
			worker.postMessage(request(id));
		});
	const unexpected = () => new Error('The geometry worker sent an unexpected reply');

	return {
		evaluate: async (subtree: Subtree, meshes) => {
			const reply = await ask((id) => ({ kind: 'group', id, subtree, meshes }));
			if (!('mesh' in reply)) throw unexpected();
			return reply.mesh satisfies GroupMesh | null;
		},
		edges: async (subtree, meshes, treated) => {
			const reply = await ask((id) => ({ kind: 'edges', id, subtree, meshes, ...(treated ? { treated } : {}) }));
			if (!('edges' in reply)) throw unexpected();
			return reply.edges;
		},
		svg: async (text, depth) => {
			const reply = await ask((id) => ({ kind: 'svg', id, text, depth }));
			if (!('svg' in reply)) throw unexpected();
			return reply.svg;
		},
		cavities: async (design, targetId, meshes) => {
			const reply = await ask((id) => ({ kind: 'cavities', id, design, meshes, targetId }));
			if (!('cavities' in reply)) throw unexpected();
			return reply.cavities;
		},
		dispose: () => failAll(new Error('The geometry worker was shut down')),
	};
}
