/** One response the add-on looked at on a supported site, as the options page shows it (to see why a download was or was not taken). */
export interface RecentEntry {
	at: number;
	site: string;
	/** The address without its query or fragment (which can hold a signed key). */
	url: string;
	status: number;
	contentType: string;
	disposition: string;
	/** The file name it made out, or null. */
	name: string | null;
	/** What it took it for: a model, a zip, or null when it was neither. */
	kind: 'model' | 'zip' | null;
	/** What was done or why not, in words. */
	note: string;
}

/** The last few downloads-like responses seen, in memory only. */
export class RecentLog {
	private entries: RecentEntry[] = [];

	constructor(private readonly max = 30) {}

	add(entry: RecentEntry): void {
		this.entries = [entry, ...this.entries].slice(0, this.max);
	}

	/** Newest first. */
	list(): RecentEntry[] {
		return [...this.entries];
	}

	clear(): void {
		this.entries = [];
	}
}
