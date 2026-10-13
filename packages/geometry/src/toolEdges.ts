import {
	type Design,
	type DesignNode,
	MAX_SHARP_PIECES,
	type MeshEdge,
	type NodeId,
	sharpEdges,
	usefulEdges,
	withSimpleThreads,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { evaluateGroup, type MeshTable } from './evaluate.ts';
import { subtreeHash } from './subtree.ts';

type Nodes = { nodes: Record<NodeId, DesignNode> };

/** The nodes with this one's own edge treatments left out (treatments inside it still count: they are part of its shape). */
function untreated(design: Nodes, id: NodeId): Nodes {
	const node = design.nodes[id];
	if (!node?.edges) return design;
	const { edges: _edges, ...rest } = node;
	return { nodes: { ...design.nodes, [id]: rest } };
}

/**
 * Threads stand in as plain cylinders: a real thread is hundreds of thousands of triangles whose helix is thousands of edges nobody could pick
 * (finding them took over a second, then they were refused anyway). The rest of the part keeps its edges; a treatment on the thread's own surface
 * or mouth is never offered, and would be skipped as not found if it were.
 */
function withPlainThreads(design: Nodes): Nodes {
	return withSimpleThreads(design as Design);
}

/**
 * The sharp edges the Edge tool offers on a top-level shape or group, in its own frame (where treatments are stored). They are
 * found on the solid **without** its own chamfers and rounds, so an edge that already has one is still offered, to be changed or
 * removed, and previewing a treatment doesn't change what is offered. Only edges worth choosing are offered (`usefulEdges`): a
 * shape already cut up by many treatments has thousands of tiny steps that nobody could pick, and drawing them would freeze the page.
 * With `treated`, the edges of the finished shape instead, its own chamfers and rounds included (what the ruler snaps to).
 */
export function toolEdges(
	M: ManifoldToplevel,
	design: Nodes,
	id: NodeId,
	meshes?: MeshTable,
	options: { treated?: boolean } = {},
): MeshEdge[] {
	const mesh = evaluateGroup(M, withPlainThreads(options.treated ? design : untreated(design, id)), id, meshes);
	return mesh ? usefulEdges(sharpEdges(mesh, MAX_SHARP_PIECES)) : [];
}

/** Equal keys mean `toolEdges` gives the same answer: the node's shape, ignoring its own treatments, position, name and colour. */
export function toolEdgesKey(design: Nodes, id: NodeId, options: { treated?: boolean } = {}): string {
	return options.treated ? `finished:${subtreeHash(design, id)}` : subtreeHash(untreated(design, id), id);
}
