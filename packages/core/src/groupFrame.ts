import type { Vec3 } from './camera.ts';
import type { DesignNode, GroupNode, Mat4 } from './design.ts';

/**
 * A group's own stretch. A group has a position and orientation (`transform`, rotation and position only) and may also
 * carry a `scale`: a stretch along its own axes, applied to everything it holds, about the group's origin, after its holes
 * are cut. A shape inside it is then at `transform * stretch * its own transform`. Without a `scale` nothing is stretched.
 * It exists for groups that cannot be stretched by rewriting their contents (a shape turned at an odd angle would shear).
 */

/** The smallest and largest stretch along one axis. */
export const MIN_STRETCH = 0.001;
export const MAX_STRETCH = 10000;

/** The group's stretch along its own x, y and z (1 each when it has none). */
export function groupStretch(node: GroupNode): Vec3 {
	return node.scale ?? [1, 1, 1];
}

/** True when the group has a stretch that is not 1 along every axis. */
export function isStretched(node: GroupNode): boolean {
	return node.scale?.some((s) => s !== 1) ?? false;
}

/** The group's transform with its stretch folded in: the matrix that takes a point in the group to the world (or to its parent). */
export function groupFrame(node: GroupNode): Mat4 {
	if (!node.scale) return node.transform;
	const out = [...node.transform];
	for (let col = 0; col < 3; col++)
		for (let row = 0; row < 3; row++) out[col * 4 + row] = node.transform[col * 4 + row]! * node.scale[col]!;
	return out;
}

/** Where a node's contents (or the node itself) sit: a group's frame, with its stretch, or any other node's transform. */
export function nodeFrame(node: DesignNode): Mat4 {
	return node.kind === 'group' ? groupFrame(node) : node.transform;
}
