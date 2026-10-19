import { composeTransform, planeFrame, type ShapeType, type Vec3 } from '@holecraft/core';
import * as THREE from 'three';
import { createUnitGeometry } from './DesignScene.ts';
import type { PlacementTarget } from './placement.ts';

const COLOR = 0xe8a317;
const EDGE_COLOR = 0xb87400;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * The see-through ghost of a shape that is about to be put down, at the size it will have: the shape's own outline (a box for a shape built
 * from its settings, and for a saved shape, which is drawn as the box round it). Never picked, so clicks and hovers go through it, and
 * not part of the design. It starts hidden: placeGhost shows it where the pointer is.
 */
export function createGhost(type: ShapeType | null, size: Vec3): THREE.Group {
	const geometry = type ? createUnitGeometry(type) : new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
	const group = new THREE.Group();
	group.name = 'ghost';

	const body = new THREE.Mesh(
		geometry,
		new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
	);
	body.scale.set(...size);
	body.raycast = () => {};
	const edges = new THREE.LineSegments(
		new THREE.EdgesGeometry(geometry, 30),
		new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.9, depthWrite: false }),
	);
	edges.scale.set(...size);
	edges.raycast = () => {};
	group.add(body, edges);

	group.matrixAutoUpdate = false;
	group.renderOrder = 3;
	group.visible = false;
	return group;
}

/** Puts the ghost with its base centre where a shape would be put down (on the floor, or standing on a plane), or hides it for no target. */
export function placeGhost(ghost: THREE.Group, target: PlacementTarget | null): void {
	ghost.visible = target !== null;
	if (!target) return;
	const matrix =
		'plane' in target
			? composeTransform(target.point, planeFrame(target.plane.normal))
			: composeTransform([target.at[0], target.at[1], 0], IDENTITY);
	ghost.matrix.fromArray(matrix);
	ghost.matrixWorldNeedsUpdate = true;
}
