import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addShape, createEmptyDesign, type Design, parseDesign } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesignConflictError, DesignStore, isValidDesignId, StoredDesignError } from './designs.ts';
import { VersionStore } from './versions.ts';

let dir: string;
let store: DesignStore;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-designs-'));
	store = new DesignStore(dir);
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const files = async () => (await readdir(path.join(dir, 'designs')).catch(() => [])).sort();
const withBox = (d: Design) => addShape(d, 'box', [0, 0]).design;

describe('isValidDesignId', () => {
	it('accepts the ids the app generates and nothing that could escape the folder', () => {
		expect(isValidDesignId('0123456789abcdef0123456789abcdef')).toBe(true);
		for (const bad of [
			'',
			'abc',
			'../etc/passwd',
			'..',
			'.',
			'a/b',
			'a\\b',
			'0123456789abcdef0123456789abcdeg',
			'0123456789ABCDEF0123456789ABCDEF',
			'x'.repeat(64),
			'0123456789abcdef0123456789abcdef.json',
		]) {
			expect(isValidDesignId(bad), bad).toBe(false);
		}
	});
});

describe('DesignStore.create and get', () => {
	it('creates an empty design with a fresh id and stores it on disk', async () => {
		const d = await store.create();
		expect(isValidDesignId(d.id)).toBe(true);
		expect(d).toMatchObject({ name: 'Untitled design', roots: [], units: 'mm' });
		expect(await files()).toEqual([`${d.id}.json`]);
		expect(await store.get(d.id)).toEqual(d);
	});

	it('uses the name it is given, trimmed and limited in length', async () => {
		expect((await store.create('  Gear  ')).name).toBe('Gear');
		expect((await store.create('x'.repeat(500))).name).toHaveLength(120);
		expect((await store.create('   ')).name).toBe('Untitled design');
	});

	it('gives every design its own id', async () => {
		const [a, b] = [await store.create(), await store.create()];
		expect(a.id).not.toBe(b.id);
	});

	it('returns null for unknown ids and for ids that are not ids at all', async () => {
		expect(await store.get('0123456789abcdef0123456789abcdef')).toBeNull();
		expect(await store.get('../../etc/passwd')).toBeNull();
		expect(await store.get('')).toBeNull();
	});

	it('survives a restart: a new store over the same folder sees the same designs', async () => {
		const d = await store.create('Kept');
		expect(await new DesignStore(dir).get(d.id)).toEqual(d);
	});

	it('refuses to hand out a file that is damaged, rather than pretending it is not there', async () => {
		const d = await store.create();
		await writeFile(path.join(dir, 'designs', `${d.id}.json`), '{ not json');
		await expect(store.get(d.id)).rejects.toBeInstanceOf(StoredDesignError);
	});

	it('refuses a file that parses but is not a valid design', async () => {
		const d = await store.create();
		await writeFile(path.join(dir, 'designs', `${d.id}.json`), JSON.stringify({ formatVersion: 1, id: d.id }));
		await expect(store.get(d.id)).rejects.toBeInstanceOf(StoredDesignError);
	});
});

describe('DesignStore.save', () => {
	it('stores the design and survives a restart', async () => {
		const created = await store.create('Plate');
		const saved = await store.save(created.id, withBox(created));
		expect(saved!.roots).toHaveLength(1);
		expect((await new DesignStore(dir).get(created.id))!.roots).toHaveLength(1);
	});

	it("keeps the server's creation date and stamps its own modification time", async () => {
		const created = await store.create();
		const forged = { ...withBox(created), createdAt: '1999-01-01T00:00:00.000Z', updatedAt: '1999-01-01T00:00:00.000Z' };
		const saved = (await store.save(created.id, forged))!;
		expect(saved.createdAt).toBe(created.createdAt);
		expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
		expect(saved.updatedAt).not.toBe('1999-01-01T00:00:00.000Z');
	});

	it('rejects a design that is not valid, leaving the stored one untouched', async () => {
		const created = await withSaved(store, withBox);
		const broken = JSON.parse(JSON.stringify(created)) as Design;
		broken.roots.push('ghost');
		await expect(store.save(created.id, broken)).rejects.toThrow(/ghost/);
		expect((await store.get(created.id))!.roots).toHaveLength(1);
	});

	it('rejects a design whose id is not the one being saved to', async () => {
		const [a, b] = [await store.create(), await store.create()];
		await expect(store.save(a.id, { ...b })).rejects.toThrow(/id/);
	});

	it('returns null for a design that does not exist, rather than creating it', async () => {
		const ghost = createEmptyDesign('0123456789abcdef0123456789abcdef');
		expect(await store.save(ghost.id, ghost)).toBeNull();
		expect(await files()).toEqual([]);
	});

	it('refuses ids that could escape the folder', async () => {
		expect(await store.save('../evil', createEmptyDesign('../evil'))).toBeNull();
		await expect(readFile(path.join(dir, 'evil.json'))).rejects.toThrow();
	});

	it('writes atomically: no temporary files are left behind', async () => {
		const d = await store.create();
		for (let i = 0; i < 5; i++) await store.save(d.id, withBox(d));
		expect(await files()).toEqual([`${d.id}.json`]);
	});

	it('copes with many saves at once, ending on a valid file', async () => {
		const d = await store.create();
		await Promise.all(Array.from({ length: 12 }, (_, i) => store.save(d.id, { ...d, name: `v${i}` })));
		const final = await store.get(d.id);
		expect(final!.name).toMatch(/^v\d+$/);
		expect(await files()).toEqual([`${d.id}.json`]);
	});

	it('ignores properties it does not know about', async () => {
		const d = await store.create();
		const saved = await store.save(d.id, { ...d, evil: '<script>' } as Design);
		expect((saved as unknown as Record<string, unknown>).evil).toBeUndefined();
		expect(await readFile(path.join(dir, 'designs', `${d.id}.json`), 'utf8')).not.toContain('script');
	});
});

describe('DesignStore.save when the design changed since it was opened', () => {
	it('saves when the version it was based on is the stored one, and the next save is based on what this one wrote', async () => {
		const created = await store.create('Base');
		const first = (await store.save(created.id, withBox(created), { base: created.updatedAt }))!;
		expect(first.nodes).not.toEqual(created.nodes);
		const second = await store.save(created.id, first, { base: first.updatedAt });
		expect(second).not.toBeNull();
	});

	it('refuses a save based on an older version, naming the stored time, and leaves the stored design alone', async () => {
		const created = await store.create('Base');
		const elsewhere = (await store.save(created.id, withBox(created)))!; // another tab saved
		const mine = withBox(withBox(created));
		const refused = await store.save(created.id, mine, { base: created.updatedAt }).catch((e: unknown) => e);
		expect(refused).toBeInstanceOf(DesignConflictError);
		expect((refused as DesignConflictError).updatedAt).toBe(elsewhere.updatedAt);
		expect(Object.keys((await store.get(created.id))!.nodes)).toHaveLength(1);
	});

	it('saves over a design someone else changed when it is based on the time they saved it (keeping one\u2019s own version)', async () => {
		const created = await store.create('Base');
		const elsewhere = (await store.save(created.id, withBox(created)))!;
		const mine = withBox(withBox(created));
		const saved = await store.save(created.id, mine, { base: elsewhere.updatedAt });
		expect(Object.keys(saved!.nodes)).toHaveLength(2);
	});

	it('checks nothing when no base is given, as before (other programs, older pages)', async () => {
		const created = await store.create('Base');
		await store.save(created.id, withBox(created));
		await expect(store.save(created.id, withBox(withBox(created)))).resolves.not.toBeNull();
	});

	it('is a rename or a design saved by another tab that makes a base old, but not moving it to a folder', async () => {
		const created = await store.create('Base');
		await store.setFolder(created.id, 'Parts');
		await expect(store.save(created.id, withBox(created), { base: created.updatedAt })).resolves.not.toBeNull();
		const renamed = (await store.rename(created.id, 'New name'))!;
		const refused = await store.save(created.id, withBox(created), { base: created.updatedAt }).catch((e: unknown) => e);
		expect(refused).toBeInstanceOf(DesignConflictError);
		expect((refused as DesignConflictError).updatedAt).toBe(renamed.updatedAt);
	});

	it('still returns null for a design that does not exist, whatever the base', async () => {
		const ghost = createEmptyDesign('0123456789abcdef0123456789abcdef');
		await expect(store.save(ghost.id, ghost, { base: ghost.updatedAt })).resolves.toBeNull();
	});
});

describe('DesignStore.list', () => {
	it('is empty when nothing has been saved, even before the folder exists', async () => {
		expect(await store.list()).toEqual([]);
	});

	it('summarises each design, newest first', async () => {
		const a = await store.create('Older');
		await new Promise((r) => setTimeout(r, 5));
		const b = await store.create('Newer');
		await store.save(b.id, withBox(b));
		const list = await store.list();
		expect(list.map((s) => s.name)).toEqual(['Newer', 'Older']);
		expect(list[0]).toMatchObject({ id: b.id, name: 'Newer', objectCount: 1 });
		expect(list[1]).toMatchObject({ id: a.id, objectCount: 0 });
		expect(Object.keys(list[0]!).sort()).toEqual(['createdAt', 'id', 'name', 'objectCount', 'updatedAt']);
	});

	it('skips damaged and unrelated files instead of failing', async () => {
		const good = await store.create('Good');
		await writeFile(path.join(dir, 'designs', 'ffffffffffffffffffffffffffffffff.json'), 'garbage');
		await writeFile(path.join(dir, 'designs', 'notes.txt'), 'hello');
		await mkdir(path.join(dir, 'designs', 'subfolder'));
		expect((await store.list()).map((s) => s.id)).toEqual([good.id]);
	});
});

describe('DesignStore.rename', () => {
	it('changes the name, trimmed and limited', async () => {
		const d = await store.create('Old');
		expect((await store.rename(d.id, '  New  '))!.name).toBe('New');
		expect((await store.get(d.id))!.name).toBe('New');
		expect((await store.rename(d.id, 'x'.repeat(500)))!.name).toHaveLength(120);
	});

	it('rejects a blank name and reports an unknown design as null', async () => {
		const d = await store.create('Old');
		await expect(store.rename(d.id, '   ')).rejects.toThrow(/name/);
		expect(await store.rename('0123456789abcdef0123456789abcdef', 'x')).toBeNull();
	});
});

describe('DesignStore.duplicate', () => {
	it('makes an independent copy with a new id and a "Copy of" name', async () => {
		const original = await withSaved(store, withBox, 'Gear');
		const copy = (await store.duplicate(original.id))!;
		expect(copy.id).not.toBe(original.id);
		expect(copy.name).toBe('Copy of Gear');
		expect(copy.roots).toHaveLength(1);
		await store.save(copy.id, { ...copy, name: 'Changed' });
		expect((await store.get(original.id))!.name).toBe('Gear');
	});

	it("keeps the copy's name within the limit", async () => {
		const d = await store.create('n'.repeat(120));
		expect((await store.duplicate(d.id))!.name.length).toBeLessThanOrEqual(120);
	});

	it('returns null for an unknown design', async () => {
		expect(await store.duplicate('0123456789abcdef0123456789abcdef')).toBeNull();
	});
});

describe('DesignStore.delete', () => {
	it('removes the design, and reports whether it was there', async () => {
		const d = await store.create();
		expect(await store.delete(d.id)).toBe(true);
		expect(await store.get(d.id)).toBeNull();
		expect(await store.delete(d.id)).toBe(false);
		expect(await files()).toEqual([]);
	});

	it('refuses ids that could escape the folder', async () => {
		await writeFile(path.join(dir, 'precious.json'), '{}');
		expect(await store.delete('../precious')).toBe(false);
		expect(await readFile(path.join(dir, 'precious.json'), 'utf8')).toBe('{}');
	});
});

describe('what is stored', () => {
	it('is valid design JSON that parseDesign accepts', async () => {
		const d = await withSaved(store, withBox);
		const onDisk = JSON.parse(await readFile(path.join(dir, 'designs', `${d.id}.json`), 'utf8')) as unknown;
		expect(parseDesign(onDisk)).toEqual(d);
	});
});

async function withSaved(s: DesignStore, edit: (d: Design) => Design, name?: string): Promise<Design> {
	const created = await s.create(name);
	return (await s.save(created.id, edit(created)))!;
}

describe('folders', () => {
	it('puts a design in a folder (the name tidied), shows it in the list, and takes it out again', async () => {
		const d = await store.create('Bracket');
		const moved = await store.setFolder(d.id, '  Printer   parts ');
		expect(moved?.folder).toBe('Printer parts');
		expect((await store.list())[0]).toMatchObject({ id: d.id, folder: 'Printer parts' });
		expect((await store.get(d.id))?.folder).toBe('Printer parts');
		const out = await store.setFolder(d.id, null);
		expect(out && 'folder' in out).toBe(false);
		expect('folder' in (await store.list())[0]!).toBe(false);
	});

	it('does not count moving a design as changing it', async () => {
		const d = await store.create('Bracket');
		const before = (await store.get(d.id))!.updatedAt;
		await new Promise((r) => setTimeout(r, 5));
		expect((await store.setFolder(d.id, 'Home'))?.updatedAt).toBe(before);
	});

	it('uses the spelling the folder already has, whatever the capitals asked for', async () => {
		const a = await store.create('A');
		const b = await store.create('B');
		await store.setFolder(a.id, 'Printer parts');
		expect((await store.setFolder(b.id, 'PRINTER PARTS'))?.folder).toBe('Printer parts');
	});

	it('treats a blank folder as no folder, and reports an unknown design as null', async () => {
		const d = await store.create('A');
		await store.setFolder(d.id, 'Home');
		expect('folder' in (await store.setFolder(d.id, '   '))!).toBe(false);
		expect(await store.setFolder('ffffffffffffffffffffffffffffffff', 'Home')).toBeNull();
		expect(await store.setFolder('../x', 'Home')).toBeNull();
	});

	it('keeps the folder when the editor saves the design, whatever that copy of it says', async () => {
		const d = await store.create('A');
		await store.setFolder(d.id, 'Home');
		const saved = await store.save(d.id, { ...withBox(d), folder: 'Elsewhere' });
		expect(saved?.folder).toBe('Home');
		const fresh = await store.create('B');
		const stale = { ...withBox(fresh), folder: 'Sneaky' };
		expect((await store.save(fresh.id, stale))?.folder).toBeUndefined();
	});

	it('keeps a copy in the folder of the original', async () => {
		const d = await store.create('A');
		await store.setFolder(d.id, 'Home');
		expect((await store.duplicate(d.id))?.folder).toBe('Home');
	});

	it('renames a folder for every design in it, and merges into one that exists', async () => {
		const a = await store.create('A');
		const b = await store.create('B');
		const c = await store.create('C');
		await store.setFolder(a.id, 'Old');
		await store.setFolder(b.id, 'old');
		await store.setFolder(c.id, 'Keep');
		expect(await store.renameFolder('OLD', 'New name')).toBe(2);
		const byName = Object.fromEntries((await store.list()).map((s) => [s.name, s.folder]));
		expect(byName).toEqual({ A: 'New name', B: 'New name', C: 'Keep' });
		expect(await store.renameFolder('New name', 'keep')).toBe(2);
		expect((await store.list()).filter((s) => s.folder === 'Keep')).toHaveLength(3);
		expect(await store.renameFolder('Nothing here', 'Whatever')).toBe(0);
		await expect(store.renameFolder('Keep', '   ')).rejects.toThrow(/folder/i);
	});

	it('takes a folder apart: its designs are kept and are in no folder', async () => {
		const a = await store.create('A');
		const b = await store.create('B');
		await store.setFolder(a.id, 'Gone');
		await store.setFolder(b.id, 'Stays');
		expect(await store.removeFolder('gone')).toBe(1);
		const list = await store.list();
		expect(list).toHaveLength(2);
		expect(list.find((s) => s.name === 'A')?.folder).toBeUndefined();
		expect(list.find((s) => s.name === 'B')?.folder).toBe('Stays');
		expect(await store.removeFolder('gone')).toBe(0);
	});
});

describe('version history', () => {
	let clock: number;
	let history: DesignStore;
	const MINUTE = 60_000;

	beforeEach(() => {
		clock = Date.parse('2026-01-01T10:00:00Z');
		history = new DesignStore(dir, 'designs', new VersionStore(dir, { now: () => clock, every: 5 * MINUTE, max: 10 }));
	});

	const later = (minutes: number) => {
		clock += minutes * MINUTE;
	};

	it('keeps how a design stood before its first save, but not every save after it', async () => {
		const created = await history.create('Bracket');
		await history.save(created.id, withBox(created));
		later(1);
		await history.save(created.id, withBox(withBox(created)));
		later(1);
		await history.save(created.id, withBox(withBox(withBox(created))));
		const versions = await history.versions(created.id);
		expect(versions).toHaveLength(1);
		expect(versions[0]?.objectCount).toBe(0);
	});

	it('keeps another once the editing has paused', async () => {
		const created = await history.create('Bracket');
		await history.save(created.id, withBox(created));
		later(10);
		await history.save(created.id, withBox(withBox(created)));
		expect((await history.versions(created.id)).map((v) => v.objectCount)).toEqual([1, 0]);
	});

	it('keeps nothing when the design is not stored with a history (the library)', async () => {
		const plain = new DesignStore(dir, 'library');
		const created = await plain.create('Washer');
		await plain.save(created.id, withBox(created));
		expect(await plain.versions(created.id)).toEqual([]);
		expect(await plain.restore(created.id, '1767261600000')).toBeNull();
	});

	it('restores an earlier version as a new save, keeping the one it replaces', async () => {
		const created = await history.create('Bracket');
		await history.save(created.id, withBox(created));
		later(10);
		const current = (await history.save(created.id, withBox(withBox(created))))!;
		const [, first] = await history.versions(created.id);

		later(1);
		const restored = (await history.restore(created.id, first!.version))!;
		expect(restored.roots).toHaveLength(0);
		expect(restored.id).toBe(created.id);
		expect(restored.createdAt).toBe(created.createdAt);
		expect(restored.updatedAt > current.updatedAt).toBe(true);
		expect((await history.get(created.id))?.roots).toHaveLength(0);
		// the two boxes the design had a moment ago are one step back, though only a minute had passed
		expect((await history.versions(created.id))[0]?.objectCount).toBe(2);
	});

	it('keeps the folder a design is in, whatever the restored version says', async () => {
		const created = await history.create('Bracket');
		await history.save(created.id, withBox(created));
		await history.setFolder(created.id, 'Brackets');
		later(10);
		await history.save(created.id, withBox(withBox(created)));
		const oldest = (await history.versions(created.id)).at(-1)!;
		expect((await history.restore(created.id, oldest.version))?.folder).toBe('Brackets');
	});

	it('answers null for a design or version that is not there', async () => {
		const created = await history.create('Bracket');
		expect(await history.restore(created.id, '1767261600000')).toBeNull();
		expect(await history.restore('0123456789abcdef0123456789abcdef', '1767261600000')).toBeNull();
		expect(await history.restore('../x', '1767261600000')).toBeNull();
		expect(await history.versions('../x')).toEqual([]);
	});

	it('forgets the history of a design that is deleted', async () => {
		const created = await history.create('Bracket');
		await history.save(created.id, withBox(created));
		expect(await history.versions(created.id)).toHaveLength(1);
		await history.delete(created.id);
		expect(await history.versions(created.id)).toEqual([]);
	});

	it('can restore over a damaged file, since that is a way back to a good one', async () => {
		const created = await history.create('Bracket');
		await history.save(created.id, withBox(created));
		await writeFile(path.join(dir, 'designs', `${created.id}.json`), '{ broken');
		const [only] = await history.versions(created.id);
		expect((await history.restore(created.id, only!.version))?.roots).toHaveLength(0);
	});
});
