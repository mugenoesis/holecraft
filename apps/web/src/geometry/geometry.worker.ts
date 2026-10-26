// Runs in a Web Worker: loads manifold's WebAssembly once, then does the heavy geometry work off the
// main thread: turning a group into a single mesh, finding the edges the Edge tool offers, or working out everything to export.

import { type Design, loadFonts, type MeshData, type MeshEdge, type NodeId } from '@holecraft/core';
import {
	type ClosedCavity,
	type ConformFrame,
	collectBodies,
	conformToSurface,
	type ExportBody,
	evaluateGroup,
	evaluateNode,
	findClosedCavity,
	type GroupMesh,
	loadManifold,
	type RawMesh,
	type Subtree,
	svgToMesh,
	toolEdges,
} from '@holecraft/geometry';
import type { ManifoldToplevel } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { fontsNeededBy } from './workerFonts.ts';

export type WorkerRequest =
	| { kind: 'group'; id: number; subtree: Subtree; meshes: ReadonlyMap<string, MeshData> }
	| { kind: 'edges'; id: number; subtree: Subtree; meshes: ReadonlyMap<string, MeshData>; treated?: boolean }
	| { kind: 'svg'; id: number; text: string; depth: number }
	| { kind: 'cavity'; id: number; design: Pick<Design, 'nodes' | 'roots'>; meshes: ReadonlyMap<string, MeshData>; targetId: NodeId }
	| { kind: 'export'; id: number; design: Pick<Design, 'nodes' | 'roots'>; meshes: ReadonlyMap<string, MeshData>; cutBelowPlane?: boolean }
	| {
			kind: 'engrave';
			id: number;
			design: Pick<Design, 'nodes' | 'roots'>;
			meshes: ReadonlyMap<string, MeshData>;
			targetId: NodeId;
			frame: ConformFrame;
			polygons: [number, number][][];
			depth: number;
			mode: 'engrave' | 'raised';
			resolution: number;
	  };

export type WorkerResponse =
	| { id: number; mesh: GroupMesh | null }
	| { id: number; edges: MeshEdge[] }
	| { id: number; bodies: ExportBody[] }
	| { id: number; engraving: GroupMesh }
	| { id: number; svg: RawMesh }
	| { id: number; cavity: ClosedCavity | null }
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
		// the letters of any font the shapes use (the first time one is needed it is loaded from its own file)
		await loadFonts(fontsNeededBy(data));

		if (data.kind === 'export') {
			const bodies = collectBodies(manifold, data.design, data.meshes, { cutBelowPlane: !!data.cutBelowPlane });
			// Hand the buffers over rather than copying them.
			scope.postMessage(
				{ id: data.id, bodies },
				bodies.flatMap((b) => [b.mesh.positions.buffer, b.mesh.indices.buffer]),
			);
			return;
		}

		if (data.kind === 'engrave') {
			const target = evaluateNode(manifold, data.design, data.targetId, data.meshes);
			if (!target) throw new Error('That shape has nothing to engrave');
			const engraving = conformToSurface(manifold, target, data.frame, {
				polygons: data.polygons,
				depth: data.depth,
				mode: data.mode,
				resolution: data.resolution,
			});
			scope.postMessage({ id: data.id, engraving }, [engraving.positions.buffer, engraving.indices.buffer]);
			return;
		}

		if (data.kind === 'cavity') {
			const shape = evaluateNode(manifold, data.design, data.targetId, data.meshes);
			scope.postMessage({ id: data.id, cavity: shape ? findClosedCavity(manifold, shape) : null });
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
