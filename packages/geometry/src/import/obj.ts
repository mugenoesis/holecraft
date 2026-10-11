import { fitsFloat32, MAX_IMPORT_TRIANGLES, type RawMesh, weldMesh } from './weld.ts';

/** The three numbers of a "v x y z" line. */
function parseVertex(line: string): [number, number, number] {
	const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
	if (![x, y, z].every((n) => n !== undefined && fitsFloat32(n))) throw new Error('This OBJ contains an invalid vertex');
	return [x!, y!, z!];
}

/** The vertex numbers (counted from 0) of an "f a/b/c d/e/f ..." line. `count` is how many vertices exist so far. */
function parseFace(line: string, count: number): number[] {
	const corners = line
		.slice(2)
		.trim()
		.split(/\s+/)
		.map((token) => {
			const n = Number.parseInt(token.split('/')[0]!, 10);
			const index = n < 0 ? count + n : n - 1; // negative numbers count back from the latest vertex
			if (!Number.isInteger(n) || index < 0 || index >= count)
				throw new Error('This OBJ has a face that uses a vertex that does not exist');
			return index;
		});
	if (corners.length < 3) throw new Error('This OBJ has a face with fewer than three corners');
	return corners;
}

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
			positions.push(...parseVertex(line));
		} else if (line.startsWith('f ')) {
			const corners = parseFace(line, positions.length / 3);
			for (let k = 1; k + 1 < corners.length; k++) indices.push(corners[0]!, corners[k]!, corners[k + 1]!);
			if (indices.length / 3 > MAX_IMPORT_TRIANGLES) throw new Error('This OBJ is too large');
		}
	}
	if (indices.length === 0) throw new Error('This OBJ has no faces');
	return weldMesh(new Float32Array(positions), new Uint32Array(indices));
}
