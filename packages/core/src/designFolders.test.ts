import { describe, expect, it } from 'vitest';
import type { DesignSummary } from './design.ts';
import { cleanFolderName, filterDesigns, folderNames, groupByFolder, MAX_FOLDER_NAME_LENGTH, sortDesigns } from './designFolders.ts';

const d = (id: string, name: string, updatedAt: string, extra: Partial<DesignSummary> = {}): DesignSummary => ({
	id,
	name,
	createdAt: extra.createdAt ?? updatedAt,
	updatedAt,
	objectCount: 1,
	...extra,
});

const bracket = d('a', 'Bracket', '2026-10-03T00:00:00Z', { folder: 'Printer parts', createdAt: '2026-09-01T00:00:00Z' });
const knob = d('b', 'knob', '2026-10-01T00:00:00Z', { createdAt: '2026-10-01T00:00:00Z' });
const clip = d('c', 'Clip', '2026-10-02T00:00:00Z', { folder: 'printer parts' });
const lamp = d('e', 'Lamp', '2026-09-20T00:00:00Z', { folder: 'Home', createdAt: '2026-08-01T00:00:00Z' });
const all = [bracket, knob, clip, lamp];

describe('cleanFolderName', () => {
	it('trims and tidies a name', () => {
		expect(cleanFolderName('  Printer   parts ')).toBe('Printer parts');
	});

	it('is null for nothing, blanks and what is not text', () => {
		for (const v of [undefined, null, '', '   ', 5, {}, []]) expect(cleanFolderName(v)).toBeNull();
	});

	it('keeps a name to the longest allowed', () => {
		expect(cleanFolderName('x'.repeat(500))).toHaveLength(MAX_FOLDER_NAME_LENGTH);
	});

	it('drops control characters', () => {
		expect(cleanFolderName('a\u0000b\nc')).toBe('a b c');
	});
});

describe('sortDesigns', () => {
	it('puts the most recently changed first by default, ties by name', () => {
		expect(sortDesigns(all, 'updated').map((x) => x.id)).toEqual(['a', 'c', 'b', 'e']);
	});

	it('sorts by name without minding capitals', () => {
		expect(sortDesigns(all, 'name').map((x) => x.name)).toEqual(['Bracket', 'Clip', 'knob', 'Lamp']);
	});

	it('sorts by when it was made, newest first', () => {
		expect(sortDesigns(all, 'created').map((x) => x.id)).toEqual(['c', 'b', 'a', 'e']);
	});

	it('does not change the list it is given', () => {
		const before = all.map((x) => x.id);
		sortDesigns(all, 'name');
		expect(all.map((x) => x.id)).toEqual(before);
	});
});

describe('filterDesigns', () => {
	it('is everything for an empty search', () => {
		expect(filterDesigns(all, '')).toEqual(all);
		expect(filterDesigns(all, '   ')).toEqual(all);
	});

	it('matches a name, whatever the capitals', () => {
		expect(filterDesigns(all, 'KNOB').map((x) => x.id)).toEqual(['b']);
		expect(filterDesigns(all, 'ra').map((x) => x.id)).toEqual(['a']);
	});

	it('also matches the name of the folder a design is in', () => {
		expect(filterDesigns(all, 'home').map((x) => x.id)).toEqual(['e']);
	});

	it('needs every word to match, in the name or the folder', () => {
		expect(filterDesigns(all, 'clip printer').map((x) => x.id)).toEqual(['c']);
		expect(filterDesigns(all, 'clip home')).toEqual([]);
	});
});

describe('folders', () => {
	it('lists each folder once, without minding capitals (the first spelling is kept), in order', () => {
		expect(folderNames(all)).toEqual(['Home', 'Printer parts']);
	});

	it('groups designs by folder: those with none first, then each folder in order, empty ones left out', () => {
		const groups = groupByFolder(sortDesigns(all, 'updated'));
		expect(groups.map((g) => g.folder)).toEqual([null, 'Home', 'Printer parts']);
		expect(groups[0]!.designs.map((x) => x.id)).toEqual(['b']);
		expect(groups[2]!.designs.map((x) => x.id)).toEqual(['a', 'c']); // 'printer parts' and 'Printer parts' are one folder
	});

	it('is no groups for no designs', () => {
		expect(groupByFolder([])).toEqual([]);
	});
});
