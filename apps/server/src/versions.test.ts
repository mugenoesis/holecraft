import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addShape, createEmptyDesign, type Design } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isValidVersion, thinOut, VersionStore } from './versions.ts';

const ID = '0123456789abcdef0123456789abcdef';
const MINUTE = 60_000;

let dir: string;
let clock: number;
let store: VersionStore;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-versions-'));
	clock = Date.parse('2026-01-01T10:00:00Z');
	store = new VersionStore(dir, { now: () => clock, every: 5 * MINUTE, max: 4 });
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

/** A design as it was last saved at `minute` past ten, with `boxes` boxes in it. */
function savedAt(minute: number, boxes = 0, name = 'Bracket'): Design {
	let design: Design = {
		...createEmptyDesign(ID, name),
		updatedAt: new Date(Date.parse('2026-01-01T10:00:00Z') + minute * MINUTE).toISOString(),
	};
	for (let i = 0; i < boxes; i++) design = addShape(design, 'box', [i * 30, 0]).design;
	return { ...design, updatedAt: new Date(Date.parse('2026-01-01T10:00:00Z') + minute * MINUTE).toISOString() };
}

const folderFiles = async () => (await readdir(path.join(dir, 'versions', ID)).catch(() => [])).sort();

describe('isValidVersion', () => {
	it('accepts a time in milliseconds and nothing that could leave the folder', () => {
		expect(isValidVersion('1767261600000')).toBe(true);
		for (const bad of ['', '..', '../x', '12', 'abc', '1767261600000.json', '17672616000000000000000', '-1767261600000']) {
			expect(isValidVersion(bad), bad).toBe(false);
		}
	});
});

describe('VersionStore.keep', () => {
	it('keeps the first version it is shown', async () => {
		expect(await store.keep(savedAt(0, 1))).toBe(true);
		expect(await store.list(ID)).toHaveLength(1);
	});

	it('does not keep another until the time between them has passed', async () => {
		await store.keep(savedAt(0, 1));
		clock += 4 * MINUTE;
		expect(await store.keep(savedAt(4, 2))).toBe(false);
		clock += 1 * MINUTE;
		expect(await store.keep(savedAt(5, 3))).toBe(true);
		expect(await store.list(ID)).toHaveLength(2);
	});

	it('keeps one when told to, however recent the last was', async () => {
		await store.keep(savedAt(0, 1));
		expect(await store.keep(savedAt(1, 2), { force: true })).toBe(true);
		expect(await store.list(ID)).toHaveLength(2);
	});

	it('never keeps the same saved version twice', async () => {
		await store.keep(savedAt(0, 1));
		expect(await store.keep(savedAt(0, 1), { force: true })).toBe(false);
		clock += 10 * MINUTE;
		expect(await store.keep(savedAt(0, 1))).toBe(false);
		expect(await store.list(ID)).toHaveLength(1);
	});

	it('keeps each design apart', async () => {
		const other = { ...savedAt(0, 1), id: 'fedcba9876543210fedcba9876543210' };
		await store.keep(savedAt(0, 1));
		await store.keep(other);
		expect(await store.list(ID)).toHaveLength(1);
		expect(await store.list(other.id)).toHaveLength(1);
	});

	it('keeps at most the number asked, dropping from the middle so the oldest and the newest stay', async () => {
		for (const minute of [0, 10, 20, 30, 40, 50]) {
			clock = Date.parse('2026-01-01T10:00:00Z') + minute * MINUTE;
			await store.keep(savedAt(minute, 1));
		}
		const kept = (await store.list(ID)).map((v) => v.savedAt);
		expect(kept).toHaveLength(4);
		expect(kept[0]).toBe(savedAt(50).updatedAt);
		expect(kept.at(-1)).toBe(savedAt(0).updatedAt);
	});

	it('names each file for when it was kept and which saved version it holds, so a save never has to open the others', async () => {
		await store.keep(savedAt(0, 1));
		expect(await folderFiles()).toEqual([`${clock}-${Date.parse(savedAt(0).updatedAt)}.json`]);
	});
});

describe('VersionStore.list and get', () => {
	it('lists the newest first with what the version held', async () => {
		await store.keep(savedAt(0, 1, 'Old name'));
		clock += 10 * MINUTE;
		await store.keep(savedAt(10, 3, 'New name'));
		const list = await store.list(ID);
		expect(list.map((v) => [v.name, v.objectCount, v.savedAt])).toEqual([
			['New name', 3, savedAt(10).updatedAt],
			['Old name', 1, savedAt(0).updatedAt],
		]);
		expect(list.every((v) => isValidVersion(v.version))).toBe(true);
	});

	it('lists nothing for a design with no history, or an id that is not one', async () => {
		expect(await store.list(ID)).toEqual([]);
		expect(await store.list('../etc')).toEqual([]);
	});

	it('gives a kept version back whole', async () => {
		const design = savedAt(0, 2);
		await store.keep(design);
		const [only] = await store.list(ID);
		expect(await store.get(ID, only!.version)).toEqual(design);
	});

	it('gives null for a version that is not there or not a version', async () => {
		expect(await store.get(ID, '1767261600000')).toBeNull();
		expect(await store.get(ID, '../../designs/x')).toBeNull();
		expect(await store.get('nope', '1767261600000')).toBeNull();
	});

	it('skips a damaged file and still lists the rest', async () => {
		await store.keep(savedAt(0, 1));
		await writeFile(path.join(dir, 'versions', ID, '1767261700000-1767261700000.json'), '{ not json');
		await mkdir(path.join(dir, 'versions', ID, '1767261800000-1767261800000.json'));
		expect(await store.list(ID)).toHaveLength(1);
		expect(await store.get(ID, '1767261700000')).toBeNull();
	});
});

describe('VersionStore.removeAll', () => {
	it('takes away every version of one design and no other', async () => {
		const other = { ...savedAt(0, 1), id: 'fedcba9876543210fedcba9876543210' };
		await store.keep(savedAt(0, 1));
		await store.keep(other);
		await store.removeAll(ID);
		expect(await store.list(ID)).toEqual([]);
		expect(await store.list(other.id)).toHaveLength(1);
		await store.removeAll(ID);
	});
});

describe('thinOut', () => {
	it('chooses nothing to drop while there are fewer than three', () => {
		expect(thinOut([])).toBeNull();
		expect(thinOut([1, 2])).toBeNull();
	});

	it('drops the one whose neighbours are closest together, never the first or last', () => {
		expect(thinOut([0, 10, 11, 100])).toBe(1);
		expect(thinOut([0, 90, 99, 100])).toBe(2);
		expect(thinOut([0, 1, 2])).toBe(1);
	});
});
