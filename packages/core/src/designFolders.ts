import type { Design, DesignSummary } from './design.ts';
import { MAX_NAME_LENGTH } from './design.ts';

/*
 * Folders for the designs list. A design carries the name of its folder (one level, no nesting), so a folder exists exactly as long as a design is
 * in it and the plain one-file-per-design layout stays easy to back up. Two spellings that differ only in capitals are one folder. The rules for
 * naming, searching, sorting and grouping are here, pure, so they are tested without a screen.
 */

export const MAX_FOLDER_NAME_LENGTH = MAX_NAME_LENGTH;

export type DesignOrder = 'updated' | 'name' | 'created';

/** Control characters (and every kind of space) become one space. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being removed
const SPACES_AND_CONTROLS = /[\u0000-\u001f\u007f\s]+/g;

/** A folder name tidied (control characters and runs of spaces become one space, cut to the longest allowed), or null if nothing is left. */
export function cleanFolderName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const tidy = raw.replace(SPACES_AND_CONTROLS, ' ').trim().slice(0, MAX_FOLDER_NAME_LENGTH).trim();
	return tidy === '' ? null : tidy;
}

/** What two spellings of one folder share. */
export const folderKey = (name: string): string => name.toLocaleLowerCase();

const byName = (a: DesignSummary, b: DesignSummary) =>
	a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** A sorted copy: most recently changed first (ties by name), by name without minding capitals, or most recently made first. */
export function sortDesigns(designs: readonly DesignSummary[], order: DesignOrder): DesignSummary[] {
	const newest = (field: 'updatedAt' | 'createdAt') => (a: DesignSummary, b: DesignSummary) =>
		b[field].localeCompare(a[field]) || byName(a, b);
	const compare = order === 'name' ? byName : order === 'created' ? newest('createdAt') : newest('updatedAt');
	return [...designs].sort(compare);
}

/** The designs whose name or folder holds every word of the search (capitals do not matter); everything for an empty search. */
export function filterDesigns(designs: readonly DesignSummary[], query: string): DesignSummary[] {
	const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [...designs];
	return designs.filter((design) => {
		const text = `${design.name} ${design.folder ?? ''}`.toLocaleLowerCase();
		return words.every((word) => text.includes(word));
	});
}

const byFolderName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** The folders in use, each once (the first spelling met is the one kept), in order. */
export function folderNames(designs: readonly DesignSummary[]): string[] {
	const seen = new Map<string, string>();
	for (const design of designs) {
		if (design.folder && !seen.has(folderKey(design.folder))) seen.set(folderKey(design.folder), design.folder);
	}
	return [...seen.values()].sort(byFolderName);
}

export interface FolderGroup {
	/** The folder, or null for the designs that are in none. */
	folder: string | null;
	designs: DesignSummary[];
}

/** The designs in groups, keeping their order within each: those with no folder first, then each folder in order. Empty groups are left out. */
export function groupByFolder(designs: readonly DesignSummary[]): FolderGroup[] {
	const loose = designs.filter((d) => !d.folder);
	const groups: FolderGroup[] = loose.length > 0 ? [{ folder: null, designs: loose }] : [];
	for (const folder of folderNames(designs)) {
		groups.push({ folder, designs: designs.filter((d) => d.folder && folderKey(d.folder) === folderKey(folder)) });
	}
	return groups;
}

/** The design with its folder set, or with none (null); the same object if nothing changes. */
export function withFolder(design: Design, folder: string | null): Design {
	if ((design.folder ?? null) === folder) return design;
	const { folder: _before, ...rest } = design;
	return folder === null ? rest : { ...rest, folder };
}
