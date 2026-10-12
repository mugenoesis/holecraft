import {
	type Design,
	defaultEdgeSize,
	type MeshEdge,
	type NodeId,
	nodeBoundsIn,
	type ScreenSegment,
	transformPoint,
	type Vec3,
} from '@holecraft/core';
import type { ToolEdges } from './useToolEdges.ts';

/** What drawing the edges needs from the view: where a point lands on screen, and whether anything hides it. */
export interface EdgeView {
	project(point: Vec3): { x: number; y: number } | null;
	canSee(point: Vec3): boolean;
}

/** Where one offered edge is drawn: its visible pieces on screen, and its ends in the world (for tests and screen readers). */
export interface DrawnEdge {
	index: number;
	segments: ScreenSegment[];
	from: number[];
	to: number[];
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** The offered edges as seen now: placed by the node's transform, projected, and only the pieces nothing hides (judged at their middle). */
export function drawEdges(view: EdgeView | null, transform: readonly number[], edges: readonly MeshEdge[]): DrawnEdge[] {
	if (!view) return [];
	return edges.map((edge, index) => {
		const world = edge.points.map((p) => transformPoint(transform, p));
		const segments: ScreenSegment[] = [];
		for (let i = 0; i + 1 < world.length; i++) {
			const [p, q] = [world[i]!, world[i + 1]!];
			const [a, b] = [view.project(p), view.project(q)];
			if (a && b && view.canSee([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2])) segments.push({ edge: index, a, b });
		}
		return { index, segments, from: world[0]!.map(round2), to: world[world.length - 1]!.map(round2) };
	});
}

/** The node's size along each axis (its bounds). */
function dimensions(design: Design, id: NodeId): number[] {
	const b = nodeBoundsIn(design, id);
	return b ? [0, 1, 2].map((i) => b.max[i]! - b.min[i]!) : [20, 20, 20];
}

/** The size a treatment starts at for this node (see `defaultEdgeSize`). */
export const initialEdgeSize = (design: Design, id: NodeId) => defaultEdgeSize(dimensions(design, id), design.grid.snap);

/** The slider reaches half the part's smallest side (a treatment can't usefully be bigger), or the typed size if that's more. */
export function sliderMax(design: Design, id: NodeId, size: number): number {
	return Math.max(size, Math.round((Math.min(...dimensions(design, id)) / 2) * 10) / 10);
}

/** The line at the top of the bar. */
export function statusText(edges: ToolEdges, chosen: number): string {
	if (edges.kind === 'loading') return 'Finding edges…';
	if (edges.kind === 'failed') return `The edges could not be found: ${edges.message}`;
	if (edges.edges.length === 0) return 'This part has no sharp edges to chamfer or round';
	if (chosen === 0) return 'Click an edge to choose it (Shift adds more)';
	return chosen === 1 ? '1 edge chosen (Shift adds more)' : `${chosen} edges chosen`;
}
