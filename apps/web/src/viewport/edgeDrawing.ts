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

/** What projecting the edges needs from the view: where a point lands on screen, and whether a face there points towards the camera. */
export interface EdgeView {
	project(point: Vec3): { x: number; y: number } | null;
	facesCamera(point: Vec3, normal: Vec3): boolean;
}

/** One straight piece of an edge on screen, with a key that names it and its middle in the world (for the hidden-behind-the-model check). */
interface ProjectedSegment extends ScreenSegment {
	key: string;
	mid: Vec3;
}

/** Where one offered edge is drawn: its pieces on screen that could be seen, and its ends in the world (for tests and screen readers). */
export interface DrawnEdge {
	index: number;
	segments: ProjectedSegment[];
	from: number[];
	to: number[];
}

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** A direction turned by a transform's rotation (transforms here only move and turn, never scale). */
const turn = (m: readonly number[], n: Vec3): Vec3 => [
	m[0]! * n[0] + m[4]! * n[1] + m[8]! * n[2],
	m[1]! * n[0] + m[5]! * n[1] + m[9]! * n[2],
	m[2]! * n[0] + m[6]! * n[1] + m[10]! * n[2],
];

/**
 * The offered edges as seen now: placed by the node's transform and projected. A piece is kept only if one of the two faces that
 * meet there points towards the camera, which is cheap and removes about half of them before the costly check for being hidden
 * behind the model (see SegmentVisibility). Draws nothing for a point the view can't place.
 */
export function projectEdges(view: EdgeView | null, transform: readonly number[], edges: readonly MeshEdge[]): DrawnEdge[] {
	if (!view) return [];
	return edges.map((edge, index) => {
		const world = edge.points.map((p) => transformPoint(transform, p));
		const segments: ProjectedSegment[] = [];
		for (let i = 0; i + 1 < world.length; i++) {
			const [p, q] = [world[i]!, world[i + 1]!];
			const mid: Vec3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
			const [n1, n2] = edge.normals[i]!.map((n) => turn(transform, n)) as [Vec3, Vec3];
			if (!view.facesCamera(mid, n1) && !view.facesCamera(mid, n2)) continue;
			const [a, b] = [view.project(p), view.project(q)];
			if (a && b) segments.push({ edge: index, key: `${index}:${i}`, mid, a, b });
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
	if (edges.kind === 'tooMany') {
		return `This part has too many small edges to choose from (${edges.segments}). Apply edge treatments last, once the shapes are grouped how you want them`;
	}
	if (edges.edges.length === 0) return 'This part has no sharp edges to chamfer or round';
	if (chosen === 0) return 'Click an edge to choose it (Shift adds more)';
	return chosen === 1 ? '1 edge chosen (Shift adds more)' : `${chosen} edges chosen`;
}
