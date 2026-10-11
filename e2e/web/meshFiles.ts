/*
 * Small, independent readers for the files Holecraft exports. They are written separately from the
 * writers on purpose, so a test passing means the file really is what other programs expect.
 */

export interface StlInfo {
	headerText: string;
	triangles: number;
	/** Signed volume in mm³; positive when the triangles face outwards. */
	volume: number;
	min: [number, number, number];
	max: [number, number, number];
}

export function parseStl(file: Buffer): StlInfo {
	if (file.length < 84) throw new Error('too short to be an STL');
	const triangles = file.readUInt32LE(80);
	if (file.length !== 84 + triangles * 50) throw new Error(`STL size ${file.length} does not match ${triangles} triangles`);

	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	let volume = 0;
	for (let t = 0; t < triangles; t++) {
		const at = 84 + t * 50;
		const v = [0, 1, 2].map((k) => [0, 1, 2].map((c) => file.readFloatLE(at + 12 + k * 12 + c * 4)));
		for (const p of v) {
			for (let c = 0; c < 3; c++) {
				min[c] = Math.min(min[c]!, p[c]!);
				max[c] = Math.max(max[c]!, p[c]!);
			}
		}
		const [a, b, c] = v as [number[], number[], number[]];
		volume +=
			(a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
	}
	return { headerText: file.subarray(0, 80).toString('latin1').replace(/\0+$/, ''), triangles, volume, min, max };
}

export interface ObjInfo {
	comments: string[];
	objects: string[];
	vertices: number;
	faces: number;
	maxFaceIndex: number;
}

export function parseObj(text: string): ObjInfo {
	const lines = text.split('\n').filter(Boolean);
	const faceIndices = lines.filter((l) => l.startsWith('f ')).flatMap((l) => l.slice(2).split(' ').map(Number));
	return {
		comments: lines.filter((l) => l.startsWith('#')),
		objects: lines.filter((l) => l.startsWith('o ')).map((l) => l.slice(2)),
		vertices: lines.filter((l) => l.startsWith('v ')).length,
		faces: lines.filter((l) => l.startsWith('f ')).length,
		maxFaceIndex: Math.max(0, ...faceIndices),
	};
}

/** The files inside a 3MF (a zip with stored entries), as text. */
export function read3mf(file: Buffer): Record<string, string> {
	let end = -1;
	for (let i = file.length - 22; i >= 0; i--) {
		if (file.readUInt32LE(i) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new Error('not a zip file');

	const count = file.readUInt16LE(end + 10);
	let at = file.readUInt32LE(end + 16);
	const files: Record<string, string> = {};
	for (let i = 0; i < count; i++) {
		const method = file.readUInt16LE(at + 10);
		const size = file.readUInt32LE(at + 24);
		const nameLength = file.readUInt16LE(at + 28);
		const extraLength = file.readUInt16LE(at + 30);
		const commentLength = file.readUInt16LE(at + 32);
		const offset = file.readUInt32LE(at + 42);
		const name = file.subarray(at + 46, at + 46 + nameLength).toString('utf8');
		if (method !== 0) throw new Error(`${name} is compressed`);
		const start = offset + 30 + file.readUInt16LE(offset + 26) + file.readUInt16LE(offset + 28);
		files[name] = file.subarray(start, start + size).toString('utf8');
		at += 46 + nameLength + extraLength + commentLength;
	}
	return files;
}
