import type { Vec3 } from '@holecraft/core';
import * as THREE from 'three';

const COLOR = 0xe8a317;
/** How far past the object's sides the slab reaches, so it does not flicker against them (mm). */
const OUTSET = 0.1;
/** The slab is never thinner than this (mm), so a very thin band can still be seen. */
const MIN_THICKNESS = 0.05;

/** A translucent slab across the object from `z0` to `z1`: where the Height range tool would paint. Not part of the design. */
export function createBandMarker(bounds: { min: Vec3; max: Vec3 }, z0: number, z1: number): THREE.Group {
	const group = new THREE.Group();
	group.name = 'band-marker';
	const thickness = Math.max(z1 - z0, MIN_THICKNESS);
	const slab = new THREE.Mesh(
		new THREE.BoxGeometry(bounds.max[0] - bounds.min[0] + OUTSET * 2, bounds.max[1] - bounds.min[1] + OUTSET * 2, thickness),
		new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.3, depthWrite: false }),
	);
	slab.position.set((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, z0 + thickness / 2);
	slab.raycast = () => {}; // never picked: the tools aim through it
	slab.renderOrder = 2;
	group.add(slab);
	return group;
}
