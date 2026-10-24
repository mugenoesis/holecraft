import type { Bounds, Vec3 } from './camera.ts';
import type { Design, NodeId } from './design.ts';
import { rotationOfTransform } from './rotation.ts';

/** One measurement of a selection (its width, depth or height) and the edge of its box it is measured along. */
export interface SizeAnchor {
	axis: 'x' | 'y' | 'z';
	from: Vec3;
	to: Vec3;
	/** mm */
	length: number;
}

/** The three measurements along the front-left base corner's edges, as seen from the default view: width along the front, depth up the right, height up the left. */
export function sizeAnchors(b: Bounds): SizeAnchor[] {
	const [x0, y0, z0] = b.min;
	const [x1, y1, z1] = b.max;
	return [
		{ axis: 'x', from: [x0, y0, z0], to: [x1, y0, z0], length: x1 - x0 },
		{ axis: 'y', from: [x1, y0, z0], to: [x1, y1, z0], length: y1 - y0 },
		{ axis: 'z', from: [x0, y0, z0], to: [x0, y0, z1], length: z1 - z0 },
	];
}

/**
 * The node whose width, depth and height may be typed on the view: exactly one is selected and it is not turned at all (so the
 * box round it in the world is its own width, depth and height). Null otherwise (the labels are then read-only).
 */
export function sizeEditTarget(design: Design, selection: readonly NodeId[]): { id: NodeId; group: boolean } | null {
	if (selection.length !== 1) return null;
	const node = design.nodes[selection[0]!];
	if (!node) return null;
	const r = rotationOfTransform(node.transform);
	const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
	if (!r.every((v, i) => Math.abs(v - identity[i]!) < 1e-6)) return null;
	return { id: node.id, group: node.kind === 'group' };
}
