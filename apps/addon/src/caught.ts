/** A file the add-on caught coming down: where it came from, and its bytes when they could be copied (otherwise it is fetched again when wanted). */
export interface Caught {
	id: string;
	name: string;
	kind: 'model' | 'zip';
	size: number | null;
	url: string;
	site: string;
	/** When it was caught (ms since 1970). */
	at: number;
	bytes: Uint8Array | null;
}

/** What the popup is told about a caught file: everything but the bytes. `ready` is true when the bytes were copied. */
export interface CaughtView {
	id: string;
	name: string;
	kind: 'model' | 'zip';
	size: number | null;
	site: string;
	at: number;
	ready: boolean;
}

interface Options {
	now?: () => number;
	/** The most files kept at once. */
	maxFiles?: number;
	/** The most bytes held in all: older files lose their bytes first (they are fetched again if wanted). */
	maxBytes?: number;
	/** How long a file is kept (ms). */
	maxAge?: number;
}

let counter = 0;

/** The files caught recently, kept in memory only and for a short while: it is a hand-over place between the page's download and a button press. */
export class CaughtFiles {
	private items: Caught[] = [];
	private readonly now: () => number;
	private readonly maxFiles: number;
	private readonly maxBytes: number;
	private readonly maxAge: number;

	constructor(opts: Options = {}) {
		this.now = opts.now ?? Date.now;
		this.maxFiles = opts.maxFiles ?? 5;
		this.maxBytes = opts.maxBytes ?? 200 * 1024 * 1024;
		this.maxAge = opts.maxAge ?? 30 * 60_000;
	}

	add(file: Omit<Caught, 'id' | 'at'>): string {
		const id = `${this.now().toString(36)}-${(counter++).toString(36)}`;
		this.expire();
		this.items.push({ ...file, id, at: this.now() });
		this.items = this.items.slice(-this.maxFiles);
		this.limitBytes();
		return id;
	}

	list(): CaughtView[] {
		this.expire();
		return [...this.items].reverse().map(({ bytes, url: _url, ...rest }) => ({ ...rest, ready: bytes !== null }));
	}

	get(id: string): Caught | null {
		this.expire();
		return this.items.find((f) => f.id === id) ?? null;
	}

	/** Forgets a file that came from this address (it is about to be caught again). */
	removeByUrl(url: string): void {
		this.items = this.items.filter((f) => f.url !== url);
	}

	remove(id: string): void {
		this.items = this.items.filter((f) => f.id !== id);
	}

	count(): number {
		this.expire();
		return this.items.length;
	}

	private expire(): void {
		const oldest = this.now() - this.maxAge;
		this.items = this.items.filter((f) => f.at >= oldest);
	}

	/** Takes the bytes from the oldest files until what is held fits (the newest file's own bytes only go if it alone is too big). */
	private limitBytes(): void {
		const held = () => this.items.reduce((sum, f) => sum + (f.bytes?.length ?? 0), 0);
		for (const f of this.items) {
			if (held() <= this.maxBytes) return;
			f.bytes = null;
		}
	}
}
