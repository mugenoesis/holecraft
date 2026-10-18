import type { Design, NodeId } from './design.ts';
import { dropToWorkplane, setNodeRotation } from './edit.ts';
import { nodeBoundsIn } from './ops.ts';
import { rotateAboutWorldAxis, rotationOfTransform } from './rotation.ts';

/**
 * A resin print is peeled off the film a layer at a time, and the force grows with how much of the layer is cured at once. A model laid on
 * a slant has a thin sliver in each layer instead of its whole footprint, so it peels far more gently. This turns a shape or group by a
 * set angle about the X axis, on top of any turn it already has, and sets it back on the plane so the slicer finds it where it expects it.
 */

/** Whether a tilt can be made: one visible, unlocked shape or group is selected. */
export function canTilt(design: Design, ids: readonly NodeId[]): boolean {
	const id = ids.length === 1 ? ids[0]! : null;
	const node = id ? design.nodes[id] : undefined;
	return !!id && !!node && design.roots.includes(id) && !node.locked && !node.hidden && nodeBoundsIn(design, id) !== null;
}

/** Turns the node by `degrees` about the world's X axis (a negative angle leans the other way), about its middle, then rests it on the plane. */
export function tiltNode(design: Design, id: NodeId, degrees: number, now?: Date): Design {
	if (!canTilt(design, [id]) || !Number.isFinite(degrees) || degrees === 0) return design;
	const node = design.nodes[id]!;
	const turned = rotateAboutWorldAxis(rotationOfTransform(node.transform), 'x', (degrees * Math.PI) / 180);
	return dropToWorkplane(setNodeRotation(design, id, turned, now), [id], now);
}
