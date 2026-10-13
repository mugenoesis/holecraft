import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	createEmptyDesign,
	type Design,
	type DesignSummary,
	DesignValidationError,
	MAX_NAME_LENGTH,
	newId,
	parseDesign,
	renameDesign,
} from '@holecraft/core';

export type { DesignSummary };

/** A design file on disk that cannot be read as a design (damaged, or from something else). */
export class StoredDesignError extends Error {
	constructor(id: string, reason: string) {
		super(`The saved design ${id} could not be read: ${reason}`);
		this.name = 'StoredDesignError';
	}
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
				summaries.push({
					id,
					name: raw.name,
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
	 */
	async save(id: string, input: unknown): Promise<Design | null> {
		if (!isValidDesignId(id)) return null;
		return this.serial(id, async () => {
			const existing = await this.get(id).catch((error: unknown) => {
				// Saving a good design over a damaged file is how it gets repaired.
				if (error instanceof StoredDesignError) return createEmptyDesign(id);
				throw error;
			});
			if (!existing) return null;

			const parsed = parseDesign(input);
			if (parsed.id !== id) throw new DesignValidationError('id', 'does not match the design being saved');
			const saved: Design = { ...parsed, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
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
			if (renamed !== design) await this.write(renamed);
			return renamed;
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
