import type { PaintedMesh } from '@holecraft/core';
import * as THREE from 'three';

/**
 * Per-vertex colours (r, g, b in the scene's working colour space) for a mesh drawn one triangle at a time (three vertices each, as
 * `toCreasedNormals` gives), or null when nothing is painted. A painted triangle gets its paint's colour, the others `ownColor`.
 */
export function paintVertexColors(paint: PaintedMesh | undefined, ownColor: string): Float32Array | null {
	if (!paint) return null;
	const own = new THREE.Color(ownColor);
	const painted = paint.colors.map((c) => new THREE.Color(c));
	const out = new Float32Array(paint.triangle.length * 9);
	for (let t = 0; t < paint.triangle.length; t++) {
		const index = paint.triangle[t]!;
		const color = index === 0 ? own : (painted[index - 1] ?? own);
		for (let k = 0; k < 3; k++) {
			out[t * 9 + k * 3] = color.r;
			out[t * 9 + k * 3 + 1] = color.g;
			out[t * 9 + k * 3 + 2] = color.b;
		}
	}
	return out;
}
