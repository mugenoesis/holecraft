/** A triangle mesh before it has a name: xyz positions and triangle corner indices. */
export interface RawMesh {
	positions: Float32Array;
	indices: Uint32Array;
}

/** More triangles than this and the file is refused; the browser and the cutting code would struggle. */
export const MAX_IMPORT_TRIANGLES = 1_000_000;

/**
 * Joins corners that sit at exactly the same place (STL files repeat every corner for every
 * triangle) and drops triangles that have collapsed to a line or point.
 */
export function weldMesh(positions: Float32Array, indices: Uint32Array): RawMesh {
	const slot = new Map<string, number>();
	const remap = new Uint32Array(positions.length / 3);
	const kept: number[] = [];

	for (let i = 0; i < remap.length; i++) {
		// + 0 turns -0 into 0, so the two don't count as different places
		const x = positions[i * 3]! + 0;
		const y = positions[i * 3 + 1]! + 0;
		const z = positions[i * 3 + 2]! + 0;
		const key = `${x},${y},${z}`;
		let at = slot.get(key);
		if (at === undefined) {
			at = kept.length / 3;
			slot.set(key, at);
			kept.push(x, y, z);
		}
		remap[i] = at;
	}

	const triangles: number[] = [];
	for (let t = 0; t < indices.length; t += 3) {
		const a = remap[indices[t]!]!;
		const b = remap[indices[t + 1]!]!;
		const c = remap[indices[t + 2]!]!;
		if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
	}
	return { positions: new Float32Array(kept), indices: new Uint32Array(triangles) };
}
