import { countSegments, type Design, MAX_OFFERED_SEGMENTS, type MeshData, type MeshEdge, type NodeId } from '@holecraft/core';
import { meshRefsIn, type Subtree, subtreeOf, toolEdgesKey } from '@holecraft/geometry';
import { useEffect, useRef, useState } from 'react';

/** Asks the geometry worker which edges the Edge tool offers on a subtree's root. */
export type FindEdges = (subtree: Subtree, meshes: ReadonlyMap<string, MeshData>, treated?: boolean) => Promise<MeshEdge[]>;

export type ToolEdges =
	| { kind: 'loading' }
	| { kind: 'ready'; key: string; edges: MeshEdge[] }
	| { kind: 'tooMany'; segments: number }
	| { kind: 'failed'; message: string };

/** The edges as the tool gets them: refused, with their number, when there are too many pieces to draw without freezing the page. */
export function settled(key: string, edges: MeshEdge[]): ToolEdges {
	const segments = countSegments(edges);
	return segments > MAX_OFFERED_SEGMENTS ? { kind: 'tooMany', segments } : { kind: 'ready', key, edges };
}

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
			setState(settled(key, known));
			return;
		}
		setState({ kind: 'loading' });
		if (!modelsArrived) return;
		let current = true;
		const { design: d, meshes: m } = latest.current;
		find(subtreeOf(d, id), new Map(meshRefsIn(d, [id]).map((ref) => [ref, m.get(ref)!]))).then(
			(edges) => {
				cache.current.set(key, edges);
				if (current) setState(settled(key, edges));
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
