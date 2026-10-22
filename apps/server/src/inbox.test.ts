import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanFileName, InboxStore } from './inbox.ts';

let dir: string;
let clock: number;
let store: InboxStore;
const HOUR = 3_600_000;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-inbox-'));
	clock = Date.parse('2026-01-01T10:00:00Z');
	store = new InboxStore(dir, { now: () => clock, maxAge: 24 * HOUR, max: 3 });
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const files = async () => (await readdir(path.join(dir, 'inbox')).catch(() => [])).sort();
const bytes = (...n: number[]) => new Uint8Array(n);

describe('cleanFileName', () => {
	it('keeps a plain name', () => {
		expect(cleanFileName('Bracket v2.3mf')).toBe('Bracket v2.3mf');
	});

	it('takes the directories off, whichever way they were written', () => {
		expect(cleanFileName('../../etc/passwd')).toBe('passwd');
		expect(cleanFileName('C:\\Users\\me\\part.stl')).toBe('part.stl');
		expect(cleanFileName('/tmp/part.stl')).toBe('part.stl');
	});

	it('drops control characters, trims, and cuts a long name short keeping its extension', () => {
		expect(cleanFileName('  a\u0000b\nc.stl ')).toBe('abc.stl');
		const long = cleanFileName(`${'x'.repeat(300)}.3mf`);
		expect(long.length).toBeLessThanOrEqual(120);
		expect(long.endsWith('.3mf')).toBe(true);
	});

	it('gives a name to something that has none', () => {
		expect(cleanFileName('')).toBe('model');
		expect(cleanFileName('..')).toBe('model');
		expect(cleanFileName('   ')).toBe('model');
		expect(cleanFileName('/')).toBe('model');
	});
});

describe('InboxStore', () => {
	it('keeps a file and gives it back with its name', async () => {
		const put = await store.put('Part.stl', bytes(1, 2, 3));
		expect(put).toMatchObject({ name: 'Part.stl', size: 3 });
		expect(put.id).toMatch(/^[0-9a-f]{32}$/);
		const got = await store.get(put.id);
		expect(got?.name).toBe('Part.stl');
		expect([...got!.bytes]).toEqual([1, 2, 3]);
	});

	it('gives null for an id that is not there or not an id', async () => {
		expect(await store.get('0123456789abcdef0123456789abcdef')).toBeNull();
		expect(await store.get('../x')).toBeNull();
		expect(await store.get('')).toBeNull();
	});

	it('removes a file, and is fine if it is already gone', async () => {
		const { id } = await store.put('a.stl', bytes(1));
		expect(await store.remove(id)).toBe(true);
		expect(await store.get(id)).toBeNull();
		expect(await store.remove(id)).toBe(false);
		expect(await store.remove('../x')).toBe(false);
		expect(await files()).toEqual([]);
	});

	it('forgets files older than the age it is given, when the next one comes in', async () => {
		const old = await store.put('old.stl', bytes(1));
		clock += 25 * HOUR;
		const fresh = await store.put('fresh.stl', bytes(2));
		expect(await store.get(old.id)).toBeNull();
		expect(await store.get(fresh.id)).not.toBeNull();
		expect(await files()).toHaveLength(2);
	});

	it('does not give back a file that has expired, even before anything sweeps', async () => {
		const old = await store.put('old.stl', bytes(1));
		clock += 25 * HOUR;
		expect(await store.get(old.id)).toBeNull();
	});

	it('keeps at most the number of files it is given, dropping the oldest', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push((await store.put(`f${i}.stl`, bytes(i))).id);
			clock += 1000;
		}
		expect(await store.get(ids[0]!)).toBeNull();
		expect(await store.get(ids[1]!)).toBeNull();
		for (const id of ids.slice(2)) expect(await store.get(id)).not.toBeNull();
		expect(await files()).toHaveLength(6); // three files, each with its note
	});

	it('ignores stray files and damaged notes when it looks', async () => {
		const { id } = await store.put('ok.stl', bytes(9));
		await writeFile(path.join(dir, 'inbox', 'notes.txt'), 'hello');
		await writeFile(path.join(dir, 'inbox', `${'a'.repeat(32)}.json`), '{ broken');
		await store.put('another.stl', bytes(8));
		expect(await store.get(id)).not.toBeNull();
		await mkdir(path.join(dir, 'inbox', `${'b'.repeat(32)}.json`));
		await store.sweep();
		expect(await store.get(id)).not.toBeNull();
	});

	it('sweeps old files at start, so a restart never leaves them', async () => {
		const { id } = await store.put('old.stl', bytes(1));
		const stale = new Date(clock - 30 * HOUR);
		await utimes(path.join(dir, 'inbox', `${id}.json`), stale, stale);
		clock += 30 * HOUR;
		await store.sweep();
		expect(await files()).toEqual([]);
	});
});
