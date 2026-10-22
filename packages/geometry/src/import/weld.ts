/** A triangle mesh before it has a name: xyz positions and triangle corner indices. */
export interface RawMesh {
	positions: Float32Array;
	indices: Uint32Array;
}

/**
 * True if a number can be stored in a 32-bit float without turning into infinity. A double such as 3.5e38 is
 * finite but is just past the largest float (about 3.4e38), so `Number.isFinite` alone is not enough.
 */
export const fitsFloat32 = (n: number): boolean => Number.isFinite(Math.fround(n));

/** More triangles than this and the file is refused: a model this size is slow to draw and to cut, and needs a lot of memory in the browser. */
export const MAX_IMPORT_TRIANGLES = 3_000_000;

const bits = new Float32Array(1);
const asInt = new Uint32Array(bits.buffer);

/** A number from the three coordinates' bit patterns, spread over all 32 bits (the finishing steps of a standard hash). */
function hashCorner(x: number, y: number, z: number): number {
	bits[0] = x;
	let h = asInt[0]!;
	bits[0] = y;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) ^ asInt[0]!;
	bits[0] = z;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ asInt[0]!;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Joins corners that sit at exactly the same place (STL files repeat every corner for every triangle) and drops triangles that have collapsed
 * to a line or point. Corners are found in a table of numbers (not text keys), so a model of millions of triangles takes a few hundred
 * milliseconds and little memory. The first corner at a place keeps its number, so the result is the same as it always was.
 */
export function weldMesh(positions: Float32Array, indices: Uint32Array): RawMesh {
	if (!positions.every(Number.isFinite)) throw new Error('This model contains numbers that are too large to use');
	const corners = positions.length / 3;
	const remap = new Uint32Array(corners);
	const kept = new Float32Array(positions.length);
	let count = 0;
	let size = 1 << 16;
	let table = new Int32Array(size).fill(-1);

	/** Doubles the table when it is half full, putting every place back in. */
	const grow = () => {
		size *= 2;
		table = new Int32Array(size).fill(-1);
		for (let v = 0; v < count; v++) {
			let h = hashCorner(kept[v * 3]!, kept[v * 3 + 1]!, kept[v * 3 + 2]!) & (size - 1);
			while (table[h] !== -1) h = (h + 1) & (size - 1);
			table[h] = v;
		}
	};

	for (let i = 0; i < corners; i++) {
		// + 0 turns -0 into 0, so the two don't count as different places
		const x = positions[i * 3]! + 0;
		const y = positions[i * 3 + 1]! + 0;
		const z = positions[i * 3 + 2]! + 0;
		let h = hashCorner(x, y, z) & (size - 1);
		let at = table[h]!;
		while (at !== -1 && (kept[at * 3] !== x || kept[at * 3 + 1] !== y || kept[at * 3 + 2] !== z)) {
			h = (h + 1) & (size - 1);
			at = table[h]!;
		}
		if (at === -1) {
			at = count++;
			kept[at * 3] = x;
			kept[at * 3 + 1] = y;
			kept[at * 3 + 2] = z;
			table[h] = at;
			if (count * 2 > size) grow();
		}
		remap[i] = at;
	}

	const triangles = new Uint32Array(indices.length);
	let used = 0;
	for (let t = 0; t < indices.length; t += 3) {
		const a = remap[indices[t]!]!;
		const b = remap[indices[t + 1]!]!;
		const c = remap[indices[t + 2]!]!;
		if (a !== b && b !== c && a !== c) {
			triangles[used++] = a;
			triangles[used++] = b;
			triangles[used++] = c;
		}
	}
	return { positions: kept.slice(0, count * 3), indices: triangles.slice(0, used) };
}
