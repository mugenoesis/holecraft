import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	cleanFolderName,
	createEmptyDesign,
	type Design,
	type DesignSummary,
	DesignValidationError,
	folderKey,
	folderNames,
	MAX_NAME_LENGTH,
	newId,
	parseDesign,
	renameDesign,
	withFolder,
} from '@holecraft/core';

export type { DesignSummary };

/** A design file on disk that cannot be read as a design (damaged, or from something else). */
export class StoredDesignError extends Error {
	constructor(id: string, reason: string) {
		super(`The saved design ${id} could not be read: ${reason}`);
		this.name = 'StoredDesignError';
	}
}

/** The design was changed (saved or renamed, in another tab or window) since the version a save was based on. */
export class DesignConflictError extends Error {
	constructor(readonly updatedAt: string) {
		super('This design was changed somewhere else (another tab or window) since you opened it');
		this.name = 'DesignConflictError';
	}
}

/** A modification time now, and always later than `previous`, so two writes in the same millisecond are still told apart. */
function nextStamp(previous: string): string {
	const before = Date.parse(previous);
	return new Date(Number.isFinite(before) ? Math.max(Date.now(), before + 1) : Date.now()).toISOString();
}

const ID_PATTERN = /^[0-9a-f]{32}$/;
const FILE_PATTERN = /^[0-9a-f]{32}\.json$/;
const DEFAULT_NAME = 'Untitled design';

/** Design ids become file names, so anything that is not exactly 32 lower-case hex digits is refused. */
export const isValidDesignId = (id: string): boolean => ID_PATTERN.test(id);

const cleanName = (name: string | undefined): string => (name ?? '').trim().slice(0, MAX_NAME_LENGTH);

/**
 * Saves each design as one JSON file under `<dataDir>/designs/<id>.json`. Plain files keep a
 * single-user install easy to inspect, back up and copy. Writes go to a temporary file that is
 * then renamed over the old one, so a crash can never leave half a design behind, and saves to
 * the same design are queued so they cannot interleave.
 */
export class DesignStore {
	private readonly folder: string;
	private readonly queues = new Map<string, Promise<unknown>>();

	/** `folder` is the name of the folder under the data folder: the library of saved shapes is kept the same way as designs, in its own. */
	constructor(dataDir: string, folder = 'designs') {
		this.folder = path.join(dataDir, folder);
	}

	async list(): Promise<DesignSummary[]> {
		let names: string[];
		try {
			names = await readdir(this.folder);
		} catch {
			return [];
		}

		const summaries: DesignSummary[] = [];
		for (const name of names.filter((n) => FILE_PATTERN.test(n))) {
			try {
				const raw = JSON.parse(await readFile(path.join(this.folder, name), 'utf8')) as Record<string, unknown>;
				const id = name.slice(0, -'.json'.length);
				if (raw.id !== id || typeof raw.name !== 'string' || !Array.isArray(raw.roots)) continue;
				const folder = cleanFolderName(raw.folder);
				summaries.push({
					id,
					name: raw.name,
					...(folder ? { folder } : {}),
					createdAt: String(raw.createdAt),
					updatedAt: String(raw.updatedAt),
					objectCount: raw.roots.length,
				});
			} catch {
				// A damaged or unreadable file should not stop the rest of the designs being listed.
			}
		}
		return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
	}

	/** The design, or null if there is none with that id. Throws StoredDesignError if the file is damaged. */
	async get(id: string): Promise<Design | null> {
		if (!isValidDesignId(id)) return null;
		let text: string;
		try {
			text = await readFile(this.fileFor(id), 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw error;
		}
		try {
			return parseDesign(JSON.parse(text));
		} catch (error) {
			throw new StoredDesignError(id, error instanceof Error ? error.message : String(error));
		}
	}

	/** True if a design with this id exists on disk (it is not read or checked). */
	async exists(id: string): Promise<boolean> {
		if (!isValidDesignId(id)) return false;
		return stat(this.fileFor(id)).then(
			() => true,
			() => false,
		);
	}

	async create(name?: string): Promise<Design> {
		const design = createEmptyDesign(newId(), cleanName(name) || DEFAULT_NAME);
		await this.write(design);
		return design;
	}

	/**
	 * Replaces a design with a new version of it. The data is fully validated, the creation date
	 * stays the server's, and the modification time is stamped here, not taken from the client.
	 * Returns null if the design does not exist (saving never creates one).
	 * Throws DesignValidationError if the data is not a good design for this id.
	 * `base` is the modification time of the version the save was made from: if the stored design has been changed since, nothing is written and
	 * DesignConflictError says when it was. Without a base, nothing is checked.
	 */
	async save(id: string, input: unknown, opts: { base?: string } = {}): Promise<Design | null> {
		if (!isValidDesignId(id)) return null;
		return this.serial(id, async () => {
			let damaged = false;
			const existing = await this.get(id).catch((error: unknown) => {
				// Saving a good design over a damaged file is how it gets repaired.
				if (error instanceof StoredDesignError) {
					damaged = true;
					return createEmptyDesign(id);
				}
				throw error;
			});
			if (!existing) return null;
			if (opts.base !== undefined && !damaged && existing.updatedAt !== opts.base) throw new DesignConflictError(existing.updatedAt);

			const parsed = parseDesign(input);
			if (parsed.id !== id) throw new DesignValidationError('id', 'does not match the design being saved');
			// the folder is the server's, set only by moving: what the editor held when it opened the design may be out of date
			const saved: Design = {
				...withFolder(parsed, existing.folder ?? null),
				createdAt: existing.createdAt,
				updatedAt: nextStamp(existing.updatedAt),
			};
			await this.write(saved);
			return saved;
		});
	}

	async rename(id: string, name: string): Promise<Design | null> {
		const cleaned = cleanName(name);
		if (!cleaned) throw new DesignValidationError('name', 'must not be blank');
		return this.serial(id, async () => {
			const design = await this.get(id);
			if (!design) return null;
			const renamed = renameDesign(design, cleaned);
			if (renamed === design) return design;
			const stamped = { ...renamed, updatedAt: nextStamp(design.updatedAt) };
			await this.write(stamped);
			return stamped;
		});
	}

	/**
	 * Puts a design in a folder (null or a blank name takes it out of its folder). A folder is only a name carried by the designs in it, so
	 * naming one makes it, and a spelling that differs only in capitals from an existing folder's joins that folder. Moving is not changing
	 * the design, so its modification time stays. Null if there is no such design.
	 */
	async setFolder(id: string, name: string | null): Promise<Design | null> {
		const wanted = cleanFolderName(name);
		const known = wanted ? folderNames(await this.list()).find((f) => folderKey(f) === folderKey(wanted)) : undefined;
		return this.changeFolder(id, () => known ?? wanted);
	}

	/** Renames a folder for every design in it (a name that is another folder's joins that folder); how many designs were moved. */
	async renameFolder(from: string, to: string): Promise<number> {
		const target = cleanFolderName(to);
		if (!target) throw new DesignValidationError('folder', 'must not be blank');
		const designs = await this.list();
		const other = folderNames(designs).find((f) => folderKey(f) === folderKey(target) && folderKey(f) !== folderKey(from));
		return this.moveFolder(designs, from, other ?? target);
	}

	/** Takes a folder apart: its designs stay, in no folder. How many designs were moved. */
	async removeFolder(name: string): Promise<number> {
		return this.moveFolder(await this.list(), name, null);
	}

	private async moveFolder(designs: DesignSummary[], from: string, to: string | null): Promise<number> {
		const inFolder = designs.filter((d) => d.folder && folderKey(d.folder) === folderKey(from));
		const moved = await Promise.all(inFolder.map((d) => this.changeFolder(d.id, () => to)));
		return moved.filter(Boolean).length;
	}

	private async changeFolder(id: string, choose: () => string | null): Promise<Design | null> {
		if (!isValidDesignId(id)) return null;
		return this.serial(id, async () => {
			const design = await this.get(id);
			if (!design) return null;
			const moved = withFolder(design, choose());
			if (moved !== design) await this.write(moved);
			return moved;
		});
	}

	async duplicate(id: string): Promise<Design | null> {
		const original = await this.get(id);
		if (!original) return null;
		const now = new Date().toISOString();
		const copy: Design = {
			...original,
			id: newId(),
			name: `Copy of ${original.name}`.slice(0, MAX_NAME_LENGTH),
			createdAt: now,
			updatedAt: now,
		};
		await this.write(copy);
		return copy;
	}

	/** True if a design was deleted, false if there was none. */
	async delete(id: string): Promise<boolean> {
		if (!isValidDesignId(id)) return false;
		return this.serial(id, async () => {
			try {
				await unlink(this.fileFor(id));
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
				throw error;
			}
		});
	}

	private fileFor(id: string): string {
		return path.join(this.folder, `${id}.json`);
	}

	private async write(design: Design): Promise<void> {
		await mkdir(this.folder, { recursive: true });
		const target = this.fileFor(design.id);
		const temporary = `${target}.${newId().slice(0, 8)}.tmp`;
		try {
			await writeFile(temporary, JSON.stringify(design));
			await rename(temporary, target);
		} catch (error) {
			await unlink(temporary).catch(() => undefined);
			throw error;
		}
	}

	/** Runs `task` after everything already queued for the same design, so changes cannot interleave. */
	private serial<T>(id: string, task: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(id) ?? Promise.resolve();
		const next = previous.then(task, task);
		const tail = next.catch(() => undefined);
		this.queues.set(id, tail);
		void tail.then(() => {
			if (this.queues.get(id) === tail) this.queues.delete(id);
		});
		return next;
	}
}
