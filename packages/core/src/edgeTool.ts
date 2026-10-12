import type { Design, EdgeTreatment, EdgeTreatmentKind, NodeId } from './design.ts';
import { edgeIsPresent, type MeshEdge } from './edges.ts';

/**
 * The rules of the Edge tool, kept free of the screen: which offered edges already carry a treatment, what choosing edges
 * does to a node's treatments, the default size, and which edge a pointer is over. `found` is always the list of edges the
 * tool offers (from the solid without its own treatments), and edges are referred to by their index in it.
 */

/** The offered edges that already have a treatment. */
export function treatedEdges(found: readonly MeshEdge[], treatments: readonly EdgeTreatment[]): Set<number> {
	const treated = new Set<number>();
	found.forEach((edge, i) => {
		if (treatments.some((t) => edgeIsPresent([edge], t))) treated.add(i);
	});
	return treated;
}

/** `treatments` without the ones lying on any of the chosen edges. Ones the tool can't see (their edge is gone) are kept. */
export function clearEdges(treatments: readonly EdgeTreatment[], found: readonly MeshEdge[], chosen: readonly number[]): EdgeTreatment[] {
	const edges = chosen.map((i) => found[i]).filter((e): e is MeshEdge => e !== undefined);
	return treatments.filter((t) => !edgeIsPresent(edges, t));
}

/** The node's treatments once the chosen edges get `kind` at `size`: a chosen edge's old treatment is replaced, never doubled. */
export function treatEdges(
	treatments: readonly EdgeTreatment[],
	found: readonly MeshEdge[],
	chosen: readonly number[],
	kind: EdgeTreatmentKind,
	size: number,
	makeId: () => string,
): EdgeTreatment[] {
	const added = chosen.flatMap((i) => {
		const edge = found[i];
		return edge ? [{ id: makeId(), kind, size, points: edge.points, normals: edge.normals }] : [];
	});
	return [...clearEdges(treatments, found, chosen), ...added];
}

/** The chosen edges after a click on `edge`: just that one, or with Shift (`add`) toggled in or out. */
export function nextChosen(chosen: readonly number[], edge: number, add: boolean): number[] {
	if (!add) return [edge];
	return chosen.includes(edge) ? chosen.filter((i) => i !== edge) : [...chosen, edge];
}

/** The size a new treatment starts at: about 5% of the part's smallest side, on the grid unless the grid is too coarse for it. */
export function defaultEdgeSize(dimensions: readonly number[], snap: number): number {
	const raw = 0.05 * Math.min(...dimensions);
	const step = snap > 0 && snap <= raw * 2 ? snap : 0.1;
	return Math.round(Math.max(step, Math.round(raw / step) * step) * 1e6) / 1e6;
}

/** A piece of an edge as drawn on screen, in pixels. */
export interface ScreenSegment {
	edge: number;
	a: { x: number; y: number };
	b: { x: number; y: number };
}

/** How near (pixels) the pointer must be to an edge to pick it. */
const REACH = 10;

/** The edge whose drawn line passes nearest the pointer, or null if none is within `reach` pixels. */
export function nearestEdge(segments: readonly ScreenSegment[], x: number, y: number, reach = REACH): number | null {
	let best: number | null = null;
	let bestDistance = reach;
	for (const { edge, a, b } of segments) {
		const [dx, dy] = [b.x - a.x, b.y - a.y];
		const len2 = dx * dx + dy * dy;
		const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
		const distance = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
		if (distance <= bestDistance) {
			best = edge;
			bestDistance = distance;
		}
	}
	return best;
}

/** What the Edge tool works on: the one selected solid shape or group, or why the selection won't do. */
export function edgeToolTarget(design: Design, selection: readonly NodeId[]): { id: NodeId } | { problem: string } {
	if (selection.length === 0) return { problem: 'Select a shape or group to chamfer or round its edges' };
	if (selection.length > 1) return { problem: 'Select just one shape or group' };
	const node = design.nodes[selection[0]!];
	if (!node || node.kind === 'mesh' || node.hidden) return { problem: 'Select a shape or group to chamfer or round its edges' };
	if (node.mode === 'hole') return { problem: 'Holes have no edges to treat; select a solid' };
	if (node.locked) return { problem: `${node.name} is locked` };
	return { id: node.id };
}

/** Edges shorter than this (mm) are not offered: too small to pick on screen, and a chamfer would be bigger than the edge. */
export const MIN_EDGE_LENGTH = 0.5;
/** More pieces than this and the tool shows nothing (and says why): drawing and testing that many would make the page freeze. */
export const MAX_OFFERED_SEGMENTS = 4000;

/** An edge's length in mm, along its whole polyline. */
export function edgeLength(edge: Pick<MeshEdge, 'points'>): number {
	let total = 0;
	for (let i = 0; i + 1 < edge.points.length; i++) {
		const [a, b] = [edge.points[i]!, edge.points[i + 1]!];
		total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
	}
	return total;
}

/** The edges worth offering: those at least MIN_EDGE_LENGTH long, in their order (a shape already cut up by many treatments has thousands of tiny steps). */
export function usefulEdges(edges: readonly MeshEdge[]): MeshEdge[] {
	return edges.filter((e) => edgeLength(e) >= MIN_EDGE_LENGTH);
}

/** How many straight pieces the edges are drawn from. */
export function countSegments(edges: readonly Pick<MeshEdge, 'points'>[]): number {
	return edges.reduce((n, e) => n + Math.max(0, e.points.length - 1), 0);
}
