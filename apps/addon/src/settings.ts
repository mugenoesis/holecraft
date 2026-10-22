/** What the add-on is set up with: where Holecraft and Trident are, and Trident's API key (kept in the add-on's own storage on this device). */
export interface Settings {
	holecraftUrl: string;
	tridentUrl: string;
	tridentKey: string;
}

export const EMPTY_SETTINGS: Settings = { holecraftUrl: '', tridentUrl: '', tridentKey: '' };

/** An address as typed, made into one fit to use: http or https (http:// is added to a bare host), no login in it, no closing slash, no query. Null if it is not one. */
export function normaliseUrl(text: string): string | null {
	const typed = text.trim();
	if (typed === '') return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(typed) ? typed : `http://${typed}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return null;
	}
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '' || url.username !== '' || url.password !== '')
		return null;
	return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Settings read back from storage (or typed on the options page): anything missing or wrong is left empty. */
export function parseSettings(raw: unknown): Settings {
	const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
	return {
		holecraftUrl: normaliseUrl(text(r.holecraftUrl)) ?? '',
		tridentUrl: normaliseUrl(text(r.tridentUrl)) ?? '',
		tridentKey: text(r.tridentKey),
	};
}
