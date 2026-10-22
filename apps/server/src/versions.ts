import { mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Design, newId, parseDesign, type VersionSummary } from '@holecraft/core';

const ID_PATTERN = /^[0-9a-f]{32}$/;
const VERSION_PATTERN = /^\d{10,15}$/;
/** `<when it was kept>-<the saved time of the version it holds>.json`, both in milliseconds. */
const FILE_PATTERN = /^(\d{10,15})-(\d{10,15})\.json$/;

/** A version's address is the time its design was last saved in milliseconds: the server stamps every save later than the one before, so it is unique per design. */
export const isValidVersion = (version: string): boolean => VERSION_PATTERN.test(version);

/** How long after one kept version the next may be taken, and how many to keep. */
const EVERY_MS = 5 * 60_000;
const MAX_VERSIONS = 50;

/**
 * Which of these times (oldest first) to let go of when there are too many: the one whose neighbours are closest together, so what is kept stays
 * spread over the whole history. The oldest and the newest are never chosen. The place in the list, or null when there are fewer than three.
 */
export function thinOut(times: readonly number[]): number | null {
	let best: number | null = null;
	let bestSpan = Number.POSITIVE_INFINITY;
	for (let i = 1; i < times.length - 1; i++) {
		const span = times[i + 1]! - times[i - 1]!;
		if (span < bestSpan) {
			best = i;
			bestSpan = span;
		}
	}
	return best;
}

interface Kept {
	takenAt: number;
	version: string;
	file: string;
}

interface Options {
	/** The time now in milliseconds (so tests can move it). */
	now?: () => number;
	/** The shortest time between two versions that are kept without being asked for. */
	every?: number;
	/** The most versions kept of one design. */
	max?: number;
}

/**
 * Earlier versions of each design, in `<dataDir>/versions/<design id>/`, one file per version. The store is shown the version that is about to be
 * replaced and keeps it if none was kept in the last few minutes, so the history holds how the design stood before each stretch of editing and
 * not every autosave. The names of the files say all a save needs to know, so it never opens the others.
 */
export class VersionStore {
	private readonly root: string;
	private readonly now: () => number;
	private readonly every: number;
	private readonly max: number;

	constructor(dataDir: string, opts: Options = {}) {
		this.root = path.join(dataDir, 'versions');
		this.now = opts.now ?? Date.now;
		this.every = opts.every ?? EVERY_MS;
		this.max = opts.max ?? MAX_VERSIONS;
	}

	/**
	 * Keeps `design` (as it was last saved) when `force` is set, or when nothing was kept in the last while. Never keeps the same saved version twice.
	 * True if it was kept.
	 */
	async keep(design: Design, opts: { force?: boolean } = {}): Promise<boolean> {
		if (!ID_PATTERN.test(design.id)) return false;
		const version = String(Date.parse(design.updatedAt));
		if (!isValidVersion(version)) return false;
		const kept = await this.files(design.id);
		if (kept.some((k) => k.version === version)) return false;
		const newest = Math.max(0, ...kept.map((k) => k.takenAt));
		const now = this.now();
		if (!opts.force && kept.length > 0 && now - newest < this.every) return false;

		const folder = path.join(this.root, design.id);
		await mkdir(folder, { recursive: true });
		const file = `${now}-${version}.json`;
		const target = path.join(folder, file);
		const temporary = `${target}.${newId().slice(0, 8)}.tmp`;
		try {
			await writeFile(temporary, JSON.stringify(design));
			await rename(temporary, target);
		} catch (error) {
			await unlink(temporary).catch(() => undefined);
			throw error;
		}
		await this.trim(design.id, [...kept, { takenAt: now, version, file }]);
		return true;
	}

	/** The kept versions of a design, newest first. A file that cannot be read as a design is left out. */
	async list(id: string): Promise<VersionSummary[]> {
		const summaries: VersionSummary[] = [];
		for (const k of await this.files(id)) {
			const design = await this.read(id, k.file);
			if (design) {
				summaries.push({ version: k.version, savedAt: design.updatedAt, name: design.name, objectCount: design.roots.length });
			}
		}
		return summaries.sort((a, b) => Number(b.version) - Number(a.version));
	}

	/** A kept version, or null if there is none with that address. */
	async get(id: string, version: string): Promise<Design | null> {
		if (!isValidVersion(version)) return null;
		const found = (await this.files(id)).find((k) => k.version === version);
		return found ? this.read(id, found.file) : null;
	}

	/** Forgets every version of a design (it was deleted). */
	async removeAll(id: string): Promise<void> {
		if (!ID_PATTERN.test(id)) return;
		await rm(path.join(this.root, id), { recursive: true, force: true });
	}

	private async files(id: string): Promise<Kept[]> {
		if (!ID_PATTERN.test(id)) return [];
		let names: string[];
		try {
			names = await readdir(path.join(this.root, id));
		} catch {
			return [];
		}
		const kept: Kept[] = [];
		for (const file of names) {
			const match = FILE_PATTERN.exec(file);
			if (match) kept.push({ takenAt: Number(match[1]), version: match[2]!, file });
		}
		return kept;
	}

	private async read(id: string, file: string): Promise<Design | null> {
		try {
			const design = parseDesign(JSON.parse(await readFile(path.join(this.root, id, file), 'utf8')));
			return design.id === id ? design : null;
		} catch {
			return null;
		}
	}

	private async trim(id: string, kept: Kept[]): Promise<void> {
		const byTime = [...kept].sort((a, b) => a.takenAt - b.takenAt);
		while (byTime.length > this.max) {
			const drop = thinOut(byTime.map((k) => k.takenAt));
			if (drop === null) break;
			const [gone] = byTime.splice(drop, 1);
			await unlink(path.join(this.root, id, gone!.file)).catch(() => undefined);
		}
	}
}
