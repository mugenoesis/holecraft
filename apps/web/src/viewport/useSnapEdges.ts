import { type Design, type MeshData, type MeshEdge, type NodeId, nodeFrame, type SnapEdge, worldEdges } from '@holecraft/core';
import { meshRefsIn, subtreeOf, toolEdgesKey } from '@holecraft/geometry';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FindEdges } from './useToolEdges.ts';

/** The nodes whose edges can be snapped to: what is on show at the top level (a group's parts are inside its shape). */
export const visibleRoots = (design: Design): NodeId[] =>
	design.roots.filter((id) => {
		const node = design.nodes[id];
		return !!node && !node.hidden && node.kind !== 'mesh';
	});

/** The edges found so far (by `toolEdgesKey`), placed in the world where their shapes are: a shape whose edges have not arrived has none yet. */
export function placedEdges(
	design: Design,
	wanted: readonly (readonly [NodeId, string])[],
	known: ReadonlyMap<string, MeshEdge[]>,
): SnapEdge[] {
	return wanted.flatMap(([id, key]) => {
		const edges = known.get(key);
		const node = design.nodes[id];
		return edges && node ? worldEdges(edges, nodeFrame(node)) : [];
	});
}

/**
 * The sharp edges of everything on show, in the world, for the ruler to snap to. They are worked out in the geometry worker, one top-level shape
 * or group at a time, only while `enabled`, and again only for a shape that changed (`toolEdgesKey`). Until a shape's edges arrive it has none, and
 * a shape that cannot be worked out (not watertight, say) simply has nothing to snap to.
 */
export function useSnapEdges(find: FindEdges, design: Design, meshes: ReadonlyMap<string, MeshData>, enabled: boolean): SnapEdge[] {
	const known = useRef(new Map<string, MeshEdge[]>());
	const asked = useRef(new Set<string>());
	const [arrived, setArrived] = useState(0);
	const latest = useRef({ design, meshes });
	latest.current = { design, meshes };
	const roots = visibleRoots(design);
	const wanted = roots.map((id) => [id, toolEdgesKey(design, id, { treated: true })] as const);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `wanted` is rebuilt every render; its keys (joined below) say whether anything changed
	useEffect(() => {
		if (!enabled) return;
		const { design: d, meshes: m } = latest.current;
		for (const [id, key] of wanted) {
			if (known.current.has(key) || asked.current.has(key)) continue;
			const needed = meshRefsIn(d, [id]);
			if (!needed.every((ref) => m.has(ref))) continue;
			asked.current.add(key);
			find(subtreeOf(d, id), new Map(needed.map((ref) => [ref, m.get(ref)!])), true).then(
				(edges) => {
					known.current.set(key, edges);
					setArrived((n) => n + 1);
				},
				() => {
					known.current.set(key, []); // it cannot be worked out: nothing to snap to
					setArrived((n) => n + 1);
				},
			);
		}
	}, [find, enabled, wanted.map(([, key]) => key).join('|'), meshes]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `arrived` says new edges came in
	return useMemo(
		() => (enabled ? placedEdges(design, wanted, known.current) : []),
		[enabled, design, arrived, wanted.map(([, key]) => key).join('|')],
	);
}
