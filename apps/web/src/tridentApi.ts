import type { SupportPointsDocument } from '@holecraft/core';
/** What Holecraft's server knows about the Trident slicer it sends to. The key is never sent back: only whether there is one. */
export interface TridentStatus {
	url: string | null;
	hasKey: boolean;
}

type Fetch = typeof fetch;

/** The message the server (or the network) gave when something failed. */
async function failure(res: Response): Promise<Error> {
	const message = await res
		.json()
		.then((j: unknown) => (typeof j === 'object' && j !== null && 'error' in j && typeof j.error === 'string' ? j.error : null))
		.catch(() => null);
	return new Error(message ?? `Holecraft's server answered ${res.status}`);
}

async function call<T>(fetchImpl: Fetch, url: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetchImpl(url, init);
	} catch {
		throw new Error("Could not reach Holecraft's server");
	}
	if (!res.ok) throw await failure(res);
	return (await res.json()) as T;
}

export function getTrident(fetchImpl: Fetch = fetch): Promise<TridentStatus> {
	return call(fetchImpl, '/api/trident');
}

/** Saves the address; `key` is kept as saved when it is empty or left out, so it can be changed without being shown again. */
export function saveTrident(input: { url: string; key?: string }, fetchImpl: Fetch = fetch): Promise<TridentStatus> {
	const body = { url: input.url, ...(input.key ? { key: input.key } : {}) };
	return call(fetchImpl, '/api/trident', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

export function forgetTrident(fetchImpl: Fetch = fetch): Promise<TridentStatus> {
	return call(fetchImpl, '/api/trident', { method: 'DELETE' });
}

/** Sends a 3MF to the saved Trident through Holecraft's server; answers with the address to open the model at. */
export function sendToTrident(file: { fileName: string; data: Uint8Array }, fetchImpl: Fetch = fetch): Promise<{ openUrl: string }> {
	return call(fetchImpl, '/api/trident/send', {
		method: 'POST',
		// a header can only carry plain characters: the name travels percent-encoded
		headers: { 'content-type': 'model/3mf', 'x-file-name': encodeURIComponent(file.fileName) },
		body: file.data as BodyInit,
	});
}

/** The address without its scheme, as the menu shows it: "192.168.1.3:8000". */
export function hostLabel(url: string): string {
	return url.replace(/^https?:\/\//, '');
}

/** A first guess at where Trident is: the machine Holecraft is open on, Trident's usual port. */
export function defaultTridentAddress(where: { protocol: string; hostname: string }): string {
	return `${where.protocol}//${where.hostname}:8000`;
}

/** The hollow model Trident made, as the bytes of an STL, and the volume (mm3) of the model before and after. */
export interface Hollowed {
	stl: ArrayBuffer;
	volumeBefore: number;
	volumeAfter: number;
}

/** Sends an STL to Trident through Holecraft's server to be hollowed (a wall of `wall` mm, at `quality` 0 to 1); the answer is the model with a cavity. */
export async function hollowModel(
	file: { fileName: string; data: Uint8Array },
	options: { wall: number; quality: number },
	fetchImpl: Fetch = fetch,
): Promise<Hollowed> {
	let res: Response;
	try {
		res = await fetchImpl(`/api/trident/hollow?wall=${options.wall}&quality=${options.quality}`, {
			method: 'POST',
			headers: { 'content-type': 'model/stl', 'x-file-name': encodeURIComponent(file.fileName) },
			body: file.data as BodyInit,
		});
	} catch {
		throw new Error("Could not reach Holecraft's server");
	}
	if (!res.ok) throw await failure(res);
	return {
		stl: await res.arrayBuffer(),
		volumeBefore: Number(res.headers.get('x-volume-before-mm3')),
		volumeAfter: Number(res.headers.get('x-volume-after-mm3')),
	};
}

/** A resin printer Trident can write files for: what the points are made for. */
export interface ResinPrinter {
	name: string;
	vendor: string;
}

/** The resin printers of the saved Trident (the ones it can write a file for), through Holecraft's server. */
export function listResinPrinters(fetchImpl: Fetch = fetch): Promise<ResinPrinter[]> {
	return call(fetchImpl, '/api/trident/resin-printers');
}

/** Asks Trident which support points its slicer would use for this model (a 3MF, as sent), for `printer`. */
export function placeSupports(
	file: { fileName: string; data: Uint8Array },
	printer: string,
	fetchImpl: Fetch = fetch,
): Promise<SupportPointsDocument> {
	return call(fetchImpl, `/api/trident/supports?printer=${encodeURIComponent(printer)}`, {
		method: 'POST',
		headers: { 'content-type': 'model/3mf', 'x-file-name': encodeURIComponent(file.fileName) },
		body: file.data as BodyInit,
	});
}

/** Keeps the support points to print with against Trident's copy of a model (so a slice of it uses exactly these); answers how many it holds. */
export async function storeSupportPoints(modelId: string, points: SupportPointsDocument, fetchImpl: Fetch = fetch): Promise<number> {
	const answer = await call<{ count: number }>(fetchImpl, `/api/trident/support-points?model=${encodeURIComponent(modelId)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(points),
	});
	return answer.count;
}

/** The id of the model in the address Trident opens it at (`<url>/?model=<id>`), or null when there is none. */
export function modelIdOf(openUrl: string): string | null {
	try {
		return new URL(openUrl).searchParams.get('model');
	} catch {
		return null;
	}
}

/** A resin printer saved in Trident: the name it was saved under, and the catalogue printer it is. */
export interface SavedPrinter {
	name: string;
	printer: string;
}

/** The resin printers saved in the Trident (an older Trident has none to list). */
export function listSavedPrinters(fetchImpl: Fetch = fetch): Promise<SavedPrinter[]> {
	return call(fetchImpl, '/api/trident/saved-printers');
}
