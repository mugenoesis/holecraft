/** The files Trident takes. (Holecraft takes a zip whole and asks which model to open itself.) */
export const TRIDENT_EXTENSIONS: readonly string[] = ['.stl', '.3mf', '.obj', '.step', '.stp'];

/** The last part of a path inside a zip. */
export const baseName = (path: string): string => path.split('/').pop() ?? path;

/** The files in a zip with one of these extensions, in order of their own names (not their folders): no folders, hidden files, or what a Mac adds. */
export function modelNamesIn(names: readonly string[], extensions: readonly string[]): string[] {
	return names
		.filter((n) => {
			const base = baseName(n);
			const lower = base.toLowerCase();
			return (
				!n.endsWith('/') &&
				!n.startsWith('__MACOSX/') &&
				!base.startsWith('.') &&
				extensions.some((e) => lower.endsWith(e) && lower.length > e.length)
			);
		})
		.sort((a, b) => baseName(a).localeCompare(baseName(b), 'en', { sensitivity: 'base' }) || a.localeCompare(b));
}
