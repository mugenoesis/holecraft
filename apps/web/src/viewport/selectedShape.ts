import {
	canResizeGroup,
	type Design,
	eulerOfTransform,
	groupGeometry,
	groupRings,
	isThreadedType,
	isUpright,
	type NodeId,
	rotationOfTransform,
	type ShapeGeometry,
	shapeCenter,
	translationOf,
	type Vec3,
} from '@holecraft/core';

export interface SelectedShape {
	id: NodeId;
	geometry: ShapeGeometry;
	/** Orientation as a row-major 3x3. */
	rotation: number[];
	/** Turn about the vertical axis in degrees; only meaningful when `upright`. */
	yaw: number;
	/** False once tipped over, when resizing and lifting are not offered. */
	upright: boolean;
	/** Middle of the shape in world space, and the radius of its rotation rings. */
	center: Vec3;
	ringRadius: number;
}

/** The single selected shape with everything the handles need, or null when none should show. */
export function selectedShape(design: Design, selection: readonly NodeId[]): SelectedShape | null {
	const id = selection.length === 1 ? selection[0]! : undefined;
	const node = id !== undefined ? design.nodes[id] : undefined;
	if (!id || !node || node.kind !== 'shape' || node.locked || node.hidden) return null;
	const [x, y, z] = translationOf(node.transform);
	const { width, depth, height } = node.params as { width: number; depth: number; height: number };
	const rotation = rotationOfTransform(node.transform);
	return {
		id,
		geometry: { x, y, z, width, depth, height },
		rotation,
		yaw: eulerOfTransform(node.transform)[2],
		upright: isUpright(rotation),
		center: shapeCenter(node.transform, height),
		ringRadius: Math.hypot(width, depth, height) / 2 + 6,
	};
}

/** What the rotation rings need for the single selected shape or group, or null when none should show. */
export function selectedRings(
	design: Design,
	selection: readonly NodeId[],
): { id: NodeId; center: Vec3; radius: number; rotation: number[] } | null {
	const id = selection.length === 1 ? selection[0]! : undefined;
	const node = id !== undefined ? design.nodes[id] : undefined;
	if (!id || !node || node.locked || node.hidden) return null;
	if (node.kind === 'group') {
		const rings = groupRings(design, id);
		return rings && { id, ...rings };
	}
	const shape = selectedShape(design, selection);
	return shape && { id, center: shape.center, radius: shape.ringRadius, rotation: shape.rotation };
}

/**
 * What the resize and lift handles need for the single selected shape or group: the box they work on (a group's is the box
 * around its contents) and its turn: about the vertical (`yaw`) when it stands upright, or the whole `rotation` when it is tipped (`tilted`),
 * in which case the handles work along the shape's own axes. Null when none should show: groups that can't be scaled exactly
 * (see `canResizeGroup`), and locked or hidden things.
 */
export function selectedHandles(
	design: Design,
	selection: readonly NodeId[],
): { id: NodeId; geometry: ShapeGeometry; yaw: number; rotation: number[]; tilted: boolean; lengthOnly: boolean } | null {
	const id = selection.length === 1 ? selection[0]! : undefined;
	const node = id !== undefined ? design.nodes[id] : undefined;
	if (!id || !node || node.locked || node.hidden) return null;
	if (node.kind === 'group') {
		const geometry = canResizeGroup(design, id) ? groupGeometry(design, id) : null;
		return (
			geometry && {
				id,
				geometry,
				yaw: eulerOfTransform(node.transform)[2],
				rotation: rotationOfTransform(node.transform),
				tilted: false,
				lengthOnly: false,
			}
		);
	}
	const shape = selectedShape(design, selection);
	return (
		shape && {
			id,
			geometry: shape.geometry,
			yaw: shape.yaw,
			rotation: shape.rotation,
			tilted: !shape.upright,
			lengthOnly: node.kind === 'shape' && isThreadedType(node.shapeType),
		}
	);
}
