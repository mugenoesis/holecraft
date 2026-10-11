import { MAX_IMPORT_TRIANGLES, type RawMesh, weldMesh } from './weld.ts';

const decoder = new TextDecoder();

/** Reads an STL file, binary or text. Corners shared between triangles are joined. */
export function parseStl(bytes: Uint8Array): RawMesh {
	if (bytes.length >= 84) {
		const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
		if (count > MAX_IMPORT_TRIANGLES && bytes.length === 84 + count * 50) throw new Error(`This STL is too large (${count} triangles)`);
		// Some text files start with "solid" and some binary ones do too, so the size is what decides.
		if (bytes.length === 84 + count * 50) return binary(bytes, count);
	}
	const head = decoder.decode(bytes.subarray(0, 5)).toLowerCase();
	if (head !== 'solid') throw new Error('This is not a valid STL file');
	return ascii(decoder.decode(bytes));
}

function binary(bytes: Uint8Array, count: number): RawMesh {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const positions = new Float32Array(count * 9);
	for (let t = 0; t < count; t++) {
		for (let k = 0; k < 9; k++) {
			// each record: 12 bytes of normal, nine floats of corners, two bytes of attributes
			const v = view.getFloat32(84 + t * 50 + 12 + k * 4, true);
			if (!Number.isFinite(v)) throw new Error('This STL contains invalid numbers');
			positions[t * 9 + k] = v;
		}
	}
	return finish(positions);
}

function ascii(text: string): RawMesh {
	const numbers: number[] = [];
	const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		for (const part of [m[1]!, m[2]!, m[3]!]) {
			const v = Number(part);
			if (!Number.isFinite(v)) throw new Error('This STL contains invalid numbers');
			numbers.push(v);
		}
		if (numbers.length / 9 > MAX_IMPORT_TRIANGLES) throw new Error('This STL is too large');
	}
	if (numbers.length === 0 || numbers.length % 9 !== 0) throw new Error('This is not a valid STL file');
	return finish(new Float32Array(numbers));
}

function finish(positions: Float32Array): RawMesh {
	const indices = new Uint32Array(positions.length / 3).map((_, i) => i);
	return weldMesh(positions, indices);
}
