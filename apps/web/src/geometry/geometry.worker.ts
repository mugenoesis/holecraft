// Runs in a Web Worker: loads manifold's WebAssembly once, then does the heavy geometry work off the
// main thread: turning a group into a single mesh, finding the edges the Edge tool offers, or working out everything to export.

import type { Design, MeshData, MeshEdge } from '@holecraft/core';
import {
	collectBodies,
	type ExportBody,
	evaluateGroup,
	type GroupMesh,
	loadManifold,
	type RawMesh,
	type Subtree,
	svgToMesh,
	toolEdges,
} from '@holecraft/geometry';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

export type WorkerRequest =
	| { kind: 'group'; id: number; subtree: Subtree; meshes: ReadonlyMap<string, MeshData> }
	| { kind: 'edges'; id: number; subtree: Subtree; meshes: ReadonlyMap<string, MeshData>; treated?: boolean }
	| { kind: 'svg'; id: number; text: string; depth: number }
	| { kind: 'export'; id: number; design: Pick<Design, 'nodes' | 'roots'>; meshes: ReadonlyMap<string, MeshData> };

export type WorkerResponse =
	| { id: number; mesh: GroupMesh | null }
	| { id: number; edges: MeshEdge[] }
	| { id: number; bodies: ExportBody[] }
	| { id: number; svg: RawMesh }
	| { id: number; error: string };

const scope = self as unknown as {
	onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
	postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

let ready: Promise<ManifoldToplevel> | undefined;

scope.onmessage = async ({ data }) => {
	try {
		ready ??= loadManifold(() => wasmUrl);
		const manifold = await ready;

		if (data.kind === 'export') {
			const bodies = collectBodies(manifold, data.design, data.meshes);
			// Hand the buffers over rather than copying them.
			scope.postMessage(
				{ id: data.id, bodies },
				bodies.flatMap((b) => [b.mesh.positions.buffer, b.mesh.indices.buffer]),
			);
			return;
		}

		if (data.kind === 'svg') {
			const svg = svgToMesh(manifold, data.text, data.depth);
			scope.postMessage({ id: data.id, svg }, [svg.positions.buffer, svg.indices.buffer]);
			return;
		}

		if (data.kind === 'edges') {
			scope.postMessage({
				id: data.id,
				edges: toolEdges(manifold, data.subtree, data.subtree.rootId, data.meshes, data.treated ? { treated: true } : {}),
			});
			return;
		}

		const mesh = evaluateGroup(manifold, data.subtree, data.subtree.rootId, data.meshes);
		scope.postMessage({ id: data.id, mesh }, mesh ? [mesh.positions.buffer, mesh.indices.buffer] : []);
	} catch (error) {
		scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
	}
};
