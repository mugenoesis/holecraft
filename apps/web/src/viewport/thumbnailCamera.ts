import { HOME_VIEW, cameraPosition, fitToBounds, type Bounds } from '@holecraft/core';
import * as THREE from 'three';
import { FOV_DEG } from './CameraRig.ts';

/** How much of the picture the design should fill along its longer side (1 = edge to edge). */
const FILL = 0.9;

/**
 * A camera that looks at the whole design from the home angle, close enough that the design fills
 * most of the picture. Starts from the editor's own "fit" distance and then tightens it, by
 * projecting the real corners of the design, so thin or spread-out designs are not left tiny.
 */
export function thumbnailCamera(bounds: Bounds, aspect: number): THREE.PerspectiveCamera {
  const state = fitToBounds(HOME_VIEW, bounds, FOV_DEG, aspect);
  const camera = new THREE.PerspectiveCamera(FOV_DEG, aspect, 1, 20_000);
  camera.up.set(0, 0, 1);

  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) corners.push(new THREE.Vector3(x, y, z));
    }
  }

  let distance = state.distance;
  // Perspective makes the size only roughly proportional to distance, so a few passes settle it.
  for (let pass = 0; pass < 6; pass++) {
    camera.position.set(...cameraPosition({ ...state, distance }));
    camera.lookAt(...state.target);
    camera.updateMatrixWorld();
    let widest = 0;
    for (const corner of corners) {
      const p = corner.clone().project(camera);
      widest = Math.max(widest, Math.abs(p.x), Math.abs(p.y));
    }
    if (widest < 1e-6) break; // a single point: leave it where it is
    distance *= widest / FILL;
  }

  camera.position.set(...cameraPosition({ ...state, distance }));
  camera.lookAt(...state.target);
  camera.updateMatrixWorld();
  return camera;
}
