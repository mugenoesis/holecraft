import type { CaughtFiles } from './caught.ts';
import { type Candidate, classifyResponse, filenameFromDisposition } from './detect.ts';
import type { RecentEntry, RecentLog } from './recent.ts';
import { type Site, siteOf } from './sites.ts';

/** The part of the browser's response filter that is used: it is handed every piece of a response, and what it writes goes on to the page. */
export interface StreamFilter {
	ondata: ((event: { data: ArrayBuffer }) => void) | null;
	onstop: (() => void) | null;
	onerror: (() => void) | null;
	write(data: ArrayBuffer): void;
	disconnect(): void;
}

/** The part of a response's details that is used. */
export interface HeaderDetails {
	requestId: string;
	tabId: number;
	url: string;
	statusCode: number;
	/** The page that started the request (a download opened in a new tab has no site in the tab itself yet). */
	originUrl?: string | undefined;
	documentUrl?: string | undefined;
	responseHeaders?: { name: string; value?: string | undefined }[] | undefined;
}

export interface CaptureDeps {
	files: CaughtFiles;
	log: RecentLog;
	/** The supported site a tab is on, or null. */
	siteOfTab: (tabId: number) => Site | null;
	/** Opens a filter on a response; missing where the browser cannot (the file is then fetched again when wanted). */
	filterResponseData: ((requestId: string) => StreamFilter) | undefined;
	/** The biggest file copied. */
	maxBytes: number;
	/** Called when the files caught have changed. */
	onChange: () => void;
	/** Called once a file has been caught (all of it has come down, or only its address is kept), with its id and the tab it came down in. */
	onCaught?: ((id: string, tabId: number) => void) | undefined;
}

const header = (details: HeaderDetails, name: string): string | undefined =>
	details.responseHeaders?.find((h) => h.name.toLowerCase() === name)?.value;

/** The address without its query and fragment: a signed link must not end up in a log. */
function plainUrl(url: string): string {
	try {
		const u = new URL(url);
		return `${u.origin}${u.pathname}`;
	} catch {
		return '';
	}
}

/** Responses that are worth a line in the log even when they are not taken: anything sent as a download, or as something binary. */
const looksLikeDownload = (disposition: string, type: string): boolean =>
	disposition !== '' || /octet-stream|zip|^model\/|sla$|3dmanufacturing/.test(type.toLowerCase());

/** The supported site a response belongs to: its tab is on one, or the page that started it is, or it is from the site itself. */
function siteOfResponse(details: HeaderDetails, deps: CaptureDeps): Site | null {
	return deps.siteOfTab(details.tabId) ?? siteOf(details.originUrl ?? '') ?? siteOf(details.documentUrl ?? '') ?? siteOf(details.url);
}

/**
 * Looks at the headers of a response in a tab on a supported site. If it is a model or a zip, its bytes are copied as they pass (every piece goes
 * on to the page at once, so the download is not slowed or changed) and kept for the popup to offer; where the browser cannot copy them, only the
 * address is kept.
 */
export function handleHeaders(details: HeaderDetails, deps: CaptureDeps): void {
	const site = siteOfResponse(details, deps);
	if (!site) return;
	const contentType = header(details, 'content-type') ?? '';
	const disposition = header(details, 'content-disposition') ?? '';
	const length = Number(header(details, 'content-length'));
	const candidate = classifyResponse({
		url: details.url,
		status: details.statusCode,
		contentType,
		contentDisposition: disposition || undefined,
		contentLength: header(details, 'content-length') === undefined ? undefined : length,
	});
	const entry = {
		at: Date.now(),
		site: site.name,
		url: plainUrl(details.url),
		status: details.statusCode,
		contentType,
		disposition,
		name: candidate?.name ?? filenameFromDisposition(disposition),
		kind: candidate?.kind ?? null,
	};
	if (!candidate) {
		if (looksLikeDownload(disposition, contentType)) deps.log.add({ ...entry, note: 'Not taken: not a model or a zip' });
		return;
	}
	if (candidate.size !== undefined && candidate.size > deps.maxBytes) {
		deps.log.add({ ...entry, note: 'Not taken: too large to copy' });
		return;
	}

	copyDownload(details, candidate, site, entry, deps);
}

/** Keeps a model or zip that is coming down: its bytes (every piece goes on to the page at once) or, where that cannot be done, its address. */
function copyDownload(details: HeaderDetails, candidate: Candidate, site: Site, entry: Omit<RecentEntry, 'note'>, deps: CaptureDeps): void {
	const keep = (bytes: Uint8Array | null) => {
		deps.files.removeByUrl(details.url);
		const id = deps.files.add({
			name: candidate.name,
			kind: candidate.kind,
			size: candidate.size ?? bytes?.length ?? null,
			url: details.url,
			site: site.name,
			bytes,
		});
		deps.onChange();
		deps.onCaught?.(id, details.tabId);
	};
	if (!deps.filterResponseData) {
		deps.log.add({ ...entry, note: 'Caught (this browser cannot copy a download: the address is kept)' });
		keep(null);
		return;
	}

	deps.log.add({ ...entry, note: 'Caught: copying the file as it comes down' });
	const filter = deps.filterResponseData(details.requestId);
	const chunks: Uint8Array[] = [];
	let total = 0;
	let usable = true;
	let finished = false;
	filter.ondata = (event) => {
		filter.write(event.data);
		if (!usable) return;
		total += event.data.byteLength;
		if (total > deps.maxBytes) {
			usable = false;
			chunks.length = 0;
			return;
		}
		chunks.push(new Uint8Array(event.data.slice(0)));
	};
	// whichever of the two comes first ends it: after an error the browser does not say stop
	const finish = (bytes: Uint8Array | null) => {
		if (finished) return;
		finished = true;
		keep(bytes);
	};
	filter.onstop = () => {
		filter.disconnect();
		finish(usable ? joined(chunks, total) : null);
	};
	filter.onerror = () => {
		usable = false;
		chunks.length = 0;
		finish(null);
	};
}

function joined(chunks: readonly Uint8Array[], total: number): Uint8Array {
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}
