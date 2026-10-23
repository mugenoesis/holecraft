import { baseName } from './names.ts';

/** The part of a download the browser lists that is used to find the file on the disk. */
export interface DownloadItem {
	id: number;
	url: string;
	finalUrl?: string | undefined;
	/** The full path of the file on the disk. */
	filename: string;
	state?: string | undefined;
	/** False when the file has already been deleted. */
	exists?: boolean | undefined;
	endTime?: string | undefined;
}

/** How close, in ms, a download must have finished to when the file was caught for a matching name alone to be enough. */
const NAME_WINDOW_MS = 60_000;

/** The name of a file from a path of either kind. */
const nameOf = (path: string): string => baseName(path.replace(/\\/g, '/')).toLowerCase();

/**
 * The download to delete after a caught file was sent: the finished one whose address (or where it led) is the address the file was caught at, or,
 * failing that, one with the same name that finished within a minute of the catch. When several match, the one that finished closest to the
 * catch. Null when nothing does: this deletes a file from someone's disk, so it never guesses.
 */
export function downloadToDelete(items: readonly DownloadItem[], file: { url: string; name: string; at: number }): number | null {
	const finishedAfter = (item: DownloadItem) => Math.abs((item.endTime ? Date.parse(item.endTime) : Number.NaN) - file.at);
	const done = items.filter((i) => i.state === 'complete' && i.exists !== false);
	const closest = (list: readonly DownloadItem[]): number | null =>
		[...list].sort((a, b) => (finishedAfter(a) || 0) - (finishedAfter(b) || 0) || b.id - a.id)[0]?.id ?? null;
	const byAddress = done.filter((i) => i.url === file.url || i.finalUrl === file.url);
	if (byAddress.length > 0) return closest(byAddress);
	const name = file.name.toLowerCase();
	const byName = done.filter((i) => nameOf(i.filename) === name && finishedAfter(i) <= NAME_WINDOW_MS);
	return closest(byName);
}

/** Whether the downloaded file may go once the caught file was sent: not a zip of which only one model went to Trident. */
export function mayDeleteDownload(kind: 'model' | 'zip', to: 'holecraft' | 'trident'): boolean {
	return !(kind === 'zip' && to === 'trident');
}
