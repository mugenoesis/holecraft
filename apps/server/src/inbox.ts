import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { newId } from '@holecraft/core';

const ID_PATTERN = /^[0-9a-f]{32}$/;
const NOTE_PATTERN = /^([0-9a-f]{32})\.json$/;
const MAX_NAME = 120;

/** A file name that is safe to keep and show: no directories, no control characters, at most 120 characters (the extension kept). */
export function cleanFileName(name: string): string {
	const last = name.split(/[\\/]/).pop() ?? '';
	const base = [...last]
		.filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
		.join('')
		.trim();
	if (base === '' || /^\.+$/.test(base)) return 'model';
	if (base.length <= MAX_NAME) return base;
	const dot = base.lastIndexOf('.');
	const extension = dot > 0 && base.length - dot <= 12 ? base.slice(dot) : '';
	return base.slice(0, MAX_NAME - extension.length) + extension;
}

interface Note {
	name: string;
	size: number;
	/** When it was put in (ms since 1970). */
	at: number;
}

interface Options {
	/** The time now in milliseconds (so tests can move it). */
	now?: () => number;
	/** How long a file waits before it is forgotten (ms). */
	maxAge?: number;
	/** The most files kept at once: the oldest go first. */
	max?: number;
}

/**
 * Model files that came from somewhere else (the browser add-on) and are waiting to be opened in the editor, in `<dataDir>/inbox/`: the file as
 * `<id>.bin` and a small note, `<id>.json`, with its name. They are temporary: a file is forgotten a day after it arrived or when more than a few
 * are waiting, and the editor deletes each once it has opened it. The id is the only thing that becomes part of a file name.
 */
export class InboxStore {
	private readonly dir: string;
	private readonly now: () => number;
	private readonly maxAge: number;
	private readonly max: number;

	constructor(dataDir: string, opts: Options = {}) {
		this.dir = path.join(dataDir, 'inbox');
		this.now = opts.now ?? Date.now;
		this.maxAge = opts.maxAge ?? 24 * 3_600_000;
		this.max = opts.max ?? 20;
	}

	/** Keeps a file, forgetting what is old or beyond the most kept. */
	async put(name: string, bytes: Uint8Array): Promise<{ id: string; name: string; size: number }> {
		await mkdir(this.dir, { recursive: true });
		const note: Note = { name: cleanFileName(name), size: bytes.length, at: this.now() };
		const id = newId();
		await this.write(`${id}.bin`, bytes);
		await this.write(`${id}.json`, JSON.stringify(note));
		await this.sweep();
		return { id, name: note.name, size: note.size };
	}

	/** A waiting file, or null if there is none with that id (or it has expired). */
	async get(id: string): Promise<{ name: string; bytes: Uint8Array } | null> {
		if (!ID_PATTERN.test(id)) return null;
		const note = await this.note(id);
		if (!note || this.now() - note.at > this.maxAge) return null;
		try {
			return { name: note.name, bytes: new Uint8Array(await readFile(path.join(this.dir, `${id}.bin`))) };
		} catch {
			return null;
		}
	}

	/** Deletes a waiting file; true if there was one. */
	async remove(id: string): Promise<boolean> {
		if (!ID_PATTERN.test(id)) return false;
		const had = (await this.note(id)) !== null;
		await rm(path.join(this.dir, `${id}.json`), { recursive: true, force: true });
		await rm(path.join(this.dir, `${id}.bin`), { force: true });
		return had;
	}

	/** Forgets files that have expired or whose note is damaged, then the oldest beyond the most kept. */
	async sweep(): Promise<void> {
		let names: string[];
		try {
			names = await readdir(this.dir);
		} catch {
			return;
		}
		const kept: { id: string; at: number }[] = [];
		for (const file of names) {
			const match = NOTE_PATTERN.exec(file);
			if (!match) continue;
			const id = match[1]!;
			const note = await this.note(id);
			if (!note || this.now() - note.at > this.maxAge) await this.forget(id);
			else kept.push({ id, at: note.at });
		}
		kept.sort((a, b) => a.at - b.at);
		for (const { id } of kept.slice(0, Math.max(0, kept.length - this.max))) await this.forget(id);
	}

	private async forget(id: string): Promise<void> {
		await rm(path.join(this.dir, `${id}.json`), { recursive: true, force: true });
		await rm(path.join(this.dir, `${id}.bin`), { force: true });
	}

	private async note(id: string): Promise<Note | null> {
		try {
			const raw = JSON.parse(await readFile(path.join(this.dir, `${id}.json`), 'utf8')) as Partial<Note>;
			return typeof raw.name === 'string' && typeof raw.size === 'number' && typeof raw.at === 'number' ? (raw as Note) : null;
		} catch {
			return null;
		}
	}

	private async write(file: string, data: Uint8Array | string): Promise<void> {
		const target = path.join(this.dir, file);
		const temporary = `${target}.${newId().slice(0, 8)}.tmp`;
		await writeFile(temporary, data);
		await rename(temporary, target);
	}
}
