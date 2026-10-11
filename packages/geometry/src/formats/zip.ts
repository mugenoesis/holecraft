/**
 * Just enough zip for 3MF files: entries are stored without compression, which every reader accepts
 * and which avoids needing a compression library. Includes a reader so files can be checked
 * (and so tests can open what was written).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32 as used by zip. */
export function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
	name: string;
	data: Uint8Array;
}

const UTF8_FLAG = 0x0800;
// 1 January 1980, the earliest date zip can store: file dates are not meaningful here, and a fixed
// one makes the same design export byte-for-byte the same.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function writeStoredZip(entries: readonly ZipEntry[]): Uint8Array {
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const { name, data } of entries) {
		const nameBytes = encoder.encode(name);
		const crc = crc32(data);

		const local = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(4, 20, true); // version needed
		lv.setUint16(6, UTF8_FLAG, true);
		lv.setUint16(8, 0, true); // stored
		lv.setUint16(10, 0, true); // time
		lv.setUint16(12, DOS_DATE, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, data.length, true);
		lv.setUint32(22, data.length, true);
		lv.setUint16(26, nameBytes.length, true);
		lv.setUint16(28, 0, true);
		local.set(nameBytes, 30);

		const entry = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(entry.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(4, 20, true); // version made by
		cv.setUint16(6, 20, true); // version needed
		cv.setUint16(8, UTF8_FLAG, true);
		cv.setUint16(10, 0, true);
		cv.setUint16(12, 0, true);
		cv.setUint16(14, DOS_DATE, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, data.length, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint32(42, offset, true); // where this entry's local header starts
		entry.set(nameBytes, 46);

		parts.push(local, data);
		central.push(entry);
		offset += local.length + data.length;
	}

	const directorySize = central.reduce((n, c) => n + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, directorySize, true);
	ev.setUint32(16, offset, true);

	const all = [...parts, ...central, end];
	const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of all) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/**
 * Reads any ordinary zip (stored or deflate-compressed entries), checking every checksum. Real 3MF
 * files from slicers and CAD programs are compressed. Uses the platform's DecompressionStream, which
 * browsers and Node both have, so no library is needed.
 */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	return readEntries(bytes, async (name, method, raw, size) => {
		if (method === 0) return raw;
		if (method !== 8) throw new Error(`Unsupported zip: ${name} uses compression method ${method}`);
		const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		const out = new Uint8Array(await new Response(stream).arrayBuffer());
		if (out.length !== size) throw new Error(`Damaged zip: ${name} has the wrong size`);
		return out;
	});
}

/** Reads a zip made of stored (uncompressed) entries, checking every checksum. Throws on anything else. */
export function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
	const files = new Map<string, Uint8Array>();
	for (const e of listEntries(bytes)) {
		if (e.method !== 0) throw new Error(`Unsupported zip: ${e.name} is compressed`);
		if (crc32(e.raw) !== e.crc) throw new Error(`Damaged zip: checksum mismatch in ${e.name}`);
		files.set(e.name, e.raw);
	}
	return files;
}

type Unpack = (name: string, method: number, raw: Uint8Array, size: number) => Promise<Uint8Array>;

async function readEntries(bytes: Uint8Array, unpack: Unpack): Promise<Map<string, Uint8Array>> {
	const files = new Map<string, Uint8Array>();
	for (const e of listEntries(bytes)) {
		const data = await unpack(e.name, e.method, e.raw, e.size);
		if (crc32(data) !== e.crc) throw new Error(`Damaged zip: checksum mismatch in ${e.name}`);
		files.set(e.name, data);
	}
	return files;
}

interface RawEntry {
	name: string;
	method: number;
	crc: number;
	/** Uncompressed size. */
	size: number;
	/** The bytes as stored in the file (compressed, if the method says so). */
	raw: Uint8Array;
}

function listEntries(bytes: Uint8Array): RawEntry[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	let end = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new Error('Not a zip file: no end-of-directory record');

	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const entries: RawEntry[] = [];

	for (let i = 0; i < count; i++) {
		if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Damaged zip: bad directory entry');
		const method = view.getUint16(at + 10, true);
		const crc = view.getUint32(at + 16, true);
		const packedSize = view.getUint32(at + 20, true);
		const size = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const localOffset = view.getUint32(at + 42, true);
		const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

		const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
		entries.push({ name, method, crc, size, raw: bytes.subarray(dataStart, dataStart + packedSize) });
		at += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}
