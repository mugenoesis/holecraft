/** A site the add-on works on: files that come down while a tab on it is open are looked at. */
export interface Site {
	id: string;
	name: string;
	/** The site's own address, and any subdomain of it. */
	host: string;
}

export const SITES: readonly Site[] = [
	{ id: 'makerworld', name: 'MakerWorld', host: 'makerworld.com' },
	{ id: 'printables', name: 'Printables', host: 'printables.com' },
	{ id: 'thingiverse', name: 'Thingiverse', host: 'thingiverse.com' },
];

/** The site an address belongs to (the site itself or a subdomain of it, over http or https), or null. */
export function siteOf(url: string): Site | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
	const host = parsed.hostname.toLowerCase();
	return SITES.find((s) => host === s.host || host.endsWith(`.${s.host}`)) ?? null;
}
