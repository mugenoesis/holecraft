import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidDesignId } from './designs.ts';

/** Largest thumbnail accepted. Real ones are a few kilobytes. */
export const MAX_THUMBNAIL_BYTES = 256 * 1024;
/** Largest width or height a thumbnail may claim, in pixels. */
const MAX_THUMBNAIL_SIDE = 512;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** True if these bytes look like a complete PNG of a sensible size: signature, header chunk, and end marker. */
function isAcceptableThumbnail(bytes: Uint8Array): boolean {
	const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (b.length < 8 + 25 + IEND.length || b.length > MAX_THUMBNAIL_BYTES) return false;
	if (!b.subarray(0, 8).equals(SIGNATURE) || b.toString('latin1', 12, 16) !== 'IHDR') return false;
	const width = b.readUInt32BE(16);
	const height = b.readUInt32BE(20);
	if (width < 1 || height < 1 || width > MAX_THUMBNAIL_SIDE || height > MAX_THUMBNAIL_SIDE) return false;
	return b.subarray(b.length - IEND.length).equals(IEND);
}

/**
 * Small pictures of designs, one PNG per design under `<dataDir>/thumbnails/<id>.png`, for the
 * designs list. They are only ever derived from the design, so losing them costs nothing.
 */
export class ThumbnailStore {
	private readonly folder: string;

	constructor(dataDir: string) {
		this.folder = path.join(dataDir, 'thumbnails');
	}

	async init(): Promise<void> {
		await mkdir(this.folder, { recursive: true });
	}

	/** Stores a picture, replacing any earlier one. Returns false (storing nothing) if it is not a good thumbnail. */
	async put(id: string, bytes: Uint8Array): Promise<boolean> {
		if (!isValidDesignId(id) || !isAcceptableThumbnail(bytes)) return false;
		const target = this.fileFor(id);
		const temporary = path.join(this.folder, `.${id}.${randomBytes(6).toString('hex')}.tmp`);
		try {
			await writeFile(temporary, bytes);
			await rename(temporary, target);
		} catch (error) {
			await unlink(temporary).catch(() => undefined);
			throw error;
		}
		return true;
	}

	async get(id: string): Promise<Buffer | null> {
		if (!isValidDesignId(id)) return null;
		return readFile(this.fileFor(id)).catch(() => null);
	}

	/** Gives `to` the same picture as `from`, if there is one. */
	async copy(from: string, to: string): Promise<void> {
		if (!isValidDesignId(from) || !isValidDesignId(to)) return;
		await copyFile(this.fileFor(from), this.fileFor(to)).catch(() => undefined);
	}

	async delete(id: string): Promise<void> {
		if (!isValidDesignId(id)) return;
		await unlink(this.fileFor(id)).catch(() => undefined);
	}

	/** When each picture was last made (milliseconds since 1970), by design id. */
	async times(): Promise<Map<string, number>> {
		const times = new Map<string, number>();
		for (const name of await readdir(this.folder).catch(() => [] as string[])) {
			const id = name.slice(0, -'.png'.length);
			if (!name.endsWith('.png') || !isValidDesignId(id)) continue;
			const info = await stat(path.join(this.folder, name)).catch(() => null);
			if (info) times.set(id, Math.round(info.mtimeMs));
		}
		return times;
	}

	private fileFor(id: string): string {
		return path.join(this.folder, `${id}.png`);
	}
}
