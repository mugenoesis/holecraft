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
