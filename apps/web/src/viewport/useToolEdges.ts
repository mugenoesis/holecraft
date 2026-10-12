import type { Design, MeshData, MeshEdge, NodeId } from '@holecraft/core';
import { meshRefsIn, type Subtree, subtreeOf, toolEdgesKey } from '@holecraft/geometry';
import { useEffect, useRef, useState } from 'react';

/** Asks the geometry worker which edges the Edge tool offers on a subtree's root. */
export type FindEdges = (subtree: Subtree, meshes: ReadonlyMap<string, MeshData>) => Promise<MeshEdge[]>;

export type ToolEdges = { kind: 'loading' } | { kind: 'ready'; key: string; edges: MeshEdge[] } | { kind: 'failed'; message: string };

/**
 * The edges the Edge tool offers on node `id`, worked out in the worker. They are asked for again only when the node's shape
 * changes (`toolEdgesKey`), not while one of its treatments is being previewed, and are remembered for undo.
 */
export function useToolEdges(find: FindEdges, design: Design, id: NodeId, meshes: ReadonlyMap<string, MeshData>): ToolEdges {
	const key = toolEdgesKey(design, id);
	const cache = useRef(new Map<string, MeshEdge[]>());
	const [state, setState] = useState<ToolEdges>({ kind: 'loading' });
	const latest = useRef({ design, meshes });
	latest.current = { design, meshes };
	const needed = meshRefsIn(design, [id]);
	const modelsArrived = needed.every((ref) => meshes.has(ref));

	useEffect(() => {
		const known = cache.current.get(key);
		if (known) {
			setState({ kind: 'ready', key, edges: known });
			return;
		}
		setState({ kind: 'loading' });
		if (!modelsArrived) return;
		let current = true;
		const { design: d, meshes: m } = latest.current;
		find(subtreeOf(d, id), new Map(meshRefsIn(d, [id]).map((ref) => [ref, m.get(ref)!]))).then(
			(edges) => {
				cache.current.set(key, edges);
				if (current) setState({ kind: 'ready', key, edges });
			},
			(error: unknown) => current && setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }),
		);
		return () => {
			current = false;
		};
	}, [find, id, key, modelsArrived]);

	// Never hand back edges of a different shape while the new ones are on their way.
	return state.kind === 'ready' && state.key !== key ? { kind: 'loading' } : state;
}
