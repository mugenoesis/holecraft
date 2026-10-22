/*
 * Just enough of the zip format to list a zip's files and take one out, for a zip caught on its way down: the add-on has to be small, so it does
 * not carry the editor's reader. Sizes come from the central directory (many programs write them after the data), and compressed entries use the
 * browser's own DecompressionStream.
 */

export interface ZipEntryInfo {
	name: string;
	/** 0 stored, 8 deflated. */
	method: number;
	compressedSize: number;
	/** The size once it is unpacked. */
	size: number;
	/** Where the entry's local header starts in the file. */
	offset: number;
}

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function notZip(why: string): Error {
	return new Error(`That is not a readable zip file (${why})`);
}

/** The files in a zip, in the order the zip lists them. Throws an error with a message fit to show if it is not a zip or is damaged. */
export function listZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let end = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
		if (view.getUint32(i, true) === END_SIGNATURE) {
			end = i;
			break;
		}
	}
	if (end < 0) throw notZip('no directory at the end');
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const entries: ZipEntryInfo[] = [];
	for (let i = 0; i < count; i++) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL_SIGNATURE) throw notZip('the directory is damaged');
		const [nameLength, extraLength, commentLength] = [
			view.getUint16(at + 28, true),
			view.getUint16(at + 30, true),
			view.getUint16(at + 32, true),
		];
		if (at + 46 + nameLength > bytes.length) throw notZip('the directory is cut short');
		entries.push({
			name: new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength)),
			method: view.getUint16(at + 10, true),
			compressedSize: view.getUint32(at + 20, true),
			size: view.getUint32(at + 24, true),
			offset: view.getUint32(at + 42, true),
		});
		at += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
}

/** One file out of a zip, unpacked. Throws an error with a message fit to show. */
export async function extractZipEntry(bytes: Uint8Array, entry: ZipEntryInfo): Promise<Uint8Array> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== LOCAL_SIGNATURE) throw notZip('an entry is damaged');
	const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
	const packed = bytes.subarray(start, start + entry.compressedSize);
	if (packed.length !== entry.compressedSize) throw notZip('an entry is cut short');
	if (entry.method === 0) {
		if (packed.length !== entry.size) throw notZip(`${entry.name} has the wrong size`);
		return packed;
	}
	if (entry.method !== 8) throw new Error(`${entry.name} uses a compression this add-on cannot read (method ${entry.method})`);
	const out = new Uint8Array(
		await new Response(new Blob([packed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer(),
	);
	if (out.length !== entry.size) throw notZip(`${entry.name} has the wrong size`);
	return out;
}
