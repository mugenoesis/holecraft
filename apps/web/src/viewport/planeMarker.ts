import { composeTransform, planeFrame, type WorkPlane } from '@holecraft/core';
import * as THREE from 'three';

const SIZE = 80;
const STEP = 10;
const COLOR = 0xe8a317;

/** How far in front of the surface the marker floats, so it doesn't flicker against it (mm). */
const LIFT = 0.05;

/** A translucent, gridded square lying on the Workplane tool's plane, centred on its origin. Not part of the design. */
export function createPlaneMarker(plane: WorkPlane): THREE.Group {
	const group = new THREE.Group();
	group.name = 'plane-marker';

	const face = new THREE.Mesh(
		new THREE.PlaneGeometry(SIZE, SIZE),
		new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
	);
	face.raycast = () => {}; // never picked: the tools aim through it
	group.add(face);

	const points: number[] = [];
	for (let i = -SIZE / 2; i <= SIZE / 2; i += STEP) points.push(i, -SIZE / 2, 0, i, SIZE / 2, 0, -SIZE / 2, i, 0, SIZE / 2, i, 0);
	const grid = new THREE.LineSegments(
		new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
		new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.7, depthWrite: false }),
	);
	grid.raycast = () => {};
	group.add(grid);

	const origin = plane.origin.map((v, k) => v + plane.normal[k]! * LIFT) as [number, number, number];
	group.matrixAutoUpdate = false;
	group.matrix.fromArray(composeTransform(origin, planeFrame(plane.normal)));
	group.renderOrder = 2;
	return group;
}
