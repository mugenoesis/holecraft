import type { Settings } from './settings.ts';

/** How a file is sent to Holecraft's inbox (see apps/server/src/importRoutes.ts: a web page cannot send this without the server agreeing). */
export const IMPORT_CONTENT_TYPE = 'application/vnd.holecraft.import';

/** A file to send. */
export interface SendFile {
	name: string;
	bytes: Uint8Array;
}

/** Something that went wrong sending, with a message fit to show. */
export class SendError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SendError';
	}
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const NOT_SET_UP = (who: string) => new SendError(`${who} is not set up yet: give its address in the add-on's settings`);
const UNREACHABLE = (who: string, url: string) =>
	new SendError(`Could not reach ${who} at ${url}. Is it running, and is the address right?`);

async function call(who: string, url: string, endpoint: string, init: RequestInit, fetchFn: Fetch): Promise<Response> {
	try {
		return await fetchFn(`${url}${endpoint}`, { ...init, redirect: 'manual', signal: AbortSignal.timeout(120_000) });
	} catch {
		throw UNREACHABLE(who, url);
	}
}

const jsonOf = (response: Response): Promise<Record<string, unknown> | null> =>
	response
		.json()
		.then((j: unknown) => (typeof j === 'object' && j !== null ? (j as Record<string, unknown>) : null))
		.catch(() => null);

/** Sends a file to Holecraft's inbox. Gives the address to open it at (always on Holecraft's own address). */
export async function sendToHolecraft(settings: Settings, file: SendFile, fetchFn: Fetch = fetch): Promise<{ openUrl: string }> {
	const url = settings.holecraftUrl;
	if (!url) throw NOT_SET_UP('Holecraft');
	const response = await call(
		'Holecraft',
		url,
		'/api/import',
		{
			method: 'POST',
			headers: { 'content-type': IMPORT_CONTENT_TYPE, 'x-holecraft-import': '1', 'x-file-name': encodeURIComponent(file.name) },
			body: file.bytes as BodyInit,
		},
		fetchFn,
	);
	if (response.status === 403) throw new SendError(`Holecraft refused the file: is ${url} really Holecraft?`);
	if (response.status === 413) throw new SendError('The file is too large for Holecraft to take (the limit is 200 MB)');
	if (response.status === 404 || response.status === 415) {
		throw new SendError(
			`Holecraft at ${url} cannot take files from the add-on: it may be an older version, or the address may be something else`,
		);
	}
	if (!response.ok) throw new SendError(`Holecraft answered with an error (${response.status})`);
	const body = await jsonOf(response);
	if (!body || typeof body.openUrl !== 'string' || !body.openUrl.startsWith('/import/')) {
		throw new SendError(`The answer from ${url} was unexpected: is that address Holecraft?`);
	}
	// only a path on this server is taken: nothing a server says can send the browser to another site
	return { openUrl: `${url}${body.openUrl}` };
}

const TRIDENT_REFUSALS: Record<number, string> = {
	401: 'Trident wants an API key, or the key is wrong: check it in the add-on’s settings',
	403: 'Trident does not allow this key to upload models: it needs a key with permission to upload',
	413: 'The file is too large for Trident to take',
	415: 'Trident cannot read that type of file',
};

/** Uploads a file to Trident. Gives the address that opens the model there. */
export async function sendToTrident(settings: Settings, file: SendFile, fetchFn: Fetch = fetch): Promise<{ openUrl: string }> {
	const url = settings.tridentUrl;
	if (!url) throw NOT_SET_UP('Trident');
	const form = new FormData();
	form.append('file', new Blob([file.bytes as BlobPart]), file.name);
	const response = await call(
		'Trident',
		url,
		'/models',
		{ method: 'POST', headers: settings.tridentKey ? { authorization: `Bearer ${settings.tridentKey}` } : {}, body: form },
		fetchFn,
	);
	if (!response.ok) throw new SendError(TRIDENT_REFUSALS[response.status] ?? `Trident answered with an error (${response.status})`);
	const body = await jsonOf(response);
	if (!body || typeof body.model_id !== 'string' || body.model_id === '') {
		throw new SendError(`The answer from ${url} was unexpected: is that address a Trident?`);
	}
	return { openUrl: `${url}/?model=${encodeURIComponent(body.model_id)}` };
}

/** Checks that Holecraft answers at its address. Says what it found. */
export async function testHolecraft(settings: Settings, fetchFn: Fetch = fetch): Promise<string> {
	const url = settings.holecraftUrl;
	if (!url) throw NOT_SET_UP('Holecraft');
	const response = await call('Holecraft', url, '/api/health', {}, fetchFn);
	const body = response.ok ? await jsonOf(response) : null;
	if (body?.name !== 'holecraft') throw new SendError(`Something answered at ${url}, but it does not look like Holecraft`);
	return `Holecraft ${typeof body.version === 'string' ? `${body.version} ` : ''}answered at ${url}`;
}

/** Checks that Trident answers at its address. Says what it found. */
export async function testTrident(settings: Settings, fetchFn: Fetch = fetch): Promise<string> {
	const url = settings.tridentUrl;
	if (!url) throw NOT_SET_UP('Trident');
	const response = await call('Trident', url, '/healthz', {}, fetchFn);
	if (!response.ok) throw new SendError(`Something answered at ${url}, but it does not look like Trident (it gave ${response.status})`);
	return `Trident answered at ${url}`;
}
