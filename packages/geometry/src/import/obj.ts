import { MAX_IMPORT_TRIANGLES, type RawMesh, weldMesh } from './weld.ts';

/**
 * Reads a Wavefront OBJ: vertices and faces only (normals, textures, materials and names are
 * ignored). Polygons are split into triangles and every object in the file is joined into one mesh.
 * Z is taken as up, as Holecraft writes it.
 */
export function parseObj(text: string): RawMesh {
	const positions: number[] = [];
	const indices: number[] = [];

	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (line.startsWith('v ')) {
			const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
			if (![x, y, z].every((n) => n !== undefined && Number.isFinite(n))) throw new Error('This OBJ contains an invalid vertex');
			positions.push(x!, y!, z!);
		} else if (line.startsWith('f ')) {
			const count = positions.length / 3;
			const corners = line
				.slice(2)
				.trim()
				.split(/\s+/)
				.map((token) => {
					const n = parseInt(token.split('/')[0]!, 10);
					const index = n < 0 ? count + n : n - 1; // negative numbers count back from the latest vertex
					if (!Number.isInteger(n) || index < 0 || index >= count)
						throw new Error('This OBJ has a face that uses a vertex that does not exist');
					return index;
				});
			if (corners.length < 3) throw new Error('This OBJ has a face with fewer than three corners');
			for (let k = 1; k + 1 < corners.length; k++) indices.push(corners[0]!, corners[k]!, corners[k + 1]!);
			if (indices.length / 3 > MAX_IMPORT_TRIANGLES) throw new Error('This OBJ is too large');
		}
	}
	if (indices.length === 0) throw new Error('This OBJ has no faces');
	return weldMesh(new Float32Array(positions), new Uint32Array(indices));
}
