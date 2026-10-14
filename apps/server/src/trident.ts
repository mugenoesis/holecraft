import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

/**
 * "Send to Trident": Holecraft's server hands the model to a Trident slicer (https://github.com/mugenoesis/Trident) itself, so the
 * browser never needs to reach Trident (no cross-site requests, and an https page may send to an http Trident). The address and the API key
 * are kept in `<data>/trident.json`, readable only by the server's user, and the key is never sent back to the browser.
 */

/** Largest file sent (Trident takes up to 500 MB). */
const MAX_SEND_BYTES = 200 * 1024 * 1024;
const MAX_KEY_LENGTH = 300;
const SEND_TIMEOUT_MS = 120_000;

interface TridentSettings {
	url: string;
	key: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

class SettingsError extends Error {}

/** The address of a Trident as it will be used: http or https, no login in it, no trailing slash. */
function normaliseTridentUrl(raw: unknown): string {
	const fail = () => new SettingsError('That is not a usable Trident address: use something like http://192.168.1.3:8000');
	if (typeof raw !== 'string') throw fail();
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw fail();
	}
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) throw fail();
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/+$/, '');
}

/** The one Trident this Holecraft sends to, kept in its data folder. */
export class TridentStore {
	private readonly file: string;

	constructor(private readonly dataDir: string) {
		this.file = path.join(dataDir, 'trident.json');
	}

	async get(): Promise<TridentSettings | null> {
		try {
			const data: unknown = JSON.parse(await readFile(this.file, 'utf8'));
			if (isObject(data) && typeof data.url === 'string')
				return { url: data.url, key: typeof data.key === 'string' && data.key ? data.key : null };
		} catch {
			// no file, or one that cannot be read: nothing is set up
		}
		return null;
	}

	/** Saves the address; the key is kept when `key` is undefined, replaced when given, and dropped when empty. */
	async put(url: string, key: string | undefined): Promise<TridentSettings> {
		const kept = key === undefined ? ((await this.get())?.key ?? null) : key || null;
		const settings = { url, key: kept };
		await mkdir(this.dataDir, { recursive: true });
		const temp = `${this.file}.${process.pid}.tmp`;
		await writeFile(temp, JSON.stringify(settings), { mode: 0o600 });
		await chmod(temp, 0o600);
		await rename(temp, this.file);
		return settings;
	}

	async clear(): Promise<void> {
		await rm(this.file, { force: true });
	}
}

const publicView = (s: TridentSettings | null) => ({ url: s?.url ?? null, hasKey: Boolean(s?.key) });

/** The header's text as the page meant it: it sends the name percent-encoded (a header cannot carry spaces and accents as they are). */
function decoded(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw; // not valid percent-encoding: take it as it is
	}
}

/** A file name Trident can take: a plain name (letters, digits and a few marks), ending .3mf. */
function sendableName(raw: unknown): string {
	const base = decoded(raw).split(/[\\/]/).pop() ?? '';
	const stem = base
		.replace(/\.[^.]*$/, '')
		.replace(/[^\p{L}\p{N}_ .()-]/gu, '_')
		.trim()
		.slice(0, 100);
	return `${stem || 'model'}.3mf`;
}

function sendFailure(reply: FastifyReply, error: string) {
	return reply.code(502).send({ error });
}

/** What to tell the user when Trident answered with something other than success. */
function refusal(status: number): string {
	if (status === 401)
		return 'Trident did not accept the API key (401). Check it in Trident under API keys, or change it in Trident settings.';
	if (status === 403) return 'Trident says this API key is not allowed to upload (403). Use a Holecraft key or a full-access key.';
	if (status === 413) return 'The file is too large for Trident.';
	if (status >= 300 && status < 400)
		return 'Trident redirected the request (check the address: use the one your browser ends up on, such as the https one).';
	return `Trident answered ${status}, so the model was not sent.`;
}

export function registerTridentRoutes(app: FastifyInstance, store: TridentStore): void {
	app.get('/api/trident', async () => publicView(await store.get()));

	app.put('/api/trident', async (request, reply) => {
		const body = request.body;
		if (!isObject(body)) return reply.code(400).send({ error: 'Send the address and the key as JSON' });
		try {
			const url = normaliseTridentUrl(body.url);
			const key = body.key;
			if (key !== undefined && (typeof key !== 'string' || key.length > MAX_KEY_LENGTH)) {
				throw new SettingsError('The API key must be text, and not very long');
			}
			return publicView(await store.put(url, typeof key === 'string' ? key.trim() : undefined));
		} catch (error) {
			if (error instanceof SettingsError) return reply.code(400).send({ error: error.message });
			throw error;
		}
	});

	app.delete('/api/trident', async () => {
		await store.clear();
		return publicView(null);
	});

	// the model arrives as `model/3mf`, with its name in `x-file-name`
	app.addContentTypeParser('model/3mf', { parseAs: 'buffer', bodyLimit: MAX_SEND_BYTES }, (_request, body, done) => done(null, body));

	app.post('/api/trident/send', { bodyLimit: MAX_SEND_BYTES }, async (request, reply) => {
		if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'Send the model as model/3mf' });
		if (request.body.length === 0) return reply.code(400).send({ error: 'There is nothing to send' });
		const settings = await store.get();
		if (!settings) return reply.code(409).send({ error: 'Trident is not set up yet: give its address first' });

		const form = new FormData();
		form.append('file', new Blob([new Uint8Array(request.body)]), sendableName(request.headers['x-file-name']));
		let response: Response;
		try {
			response = await fetch(`${settings.url}/models`, {
				method: 'POST',
				headers: settings.key ? { authorization: `Bearer ${settings.key}` } : {},
				body: form,
				redirect: 'manual',
				signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
			});
		} catch {
			return sendFailure(reply, `Could not reach Trident at ${settings.url}. Is it running, and is the address right?`);
		}
		if (!response.ok) return sendFailure(reply, refusal(response.status));

		const modelId = await response
			.json()
			.then((j: unknown) => (isObject(j) && typeof j.model_id === 'string' && j.model_id ? j.model_id : null))
			.catch(() => null);
		if (!modelId) return sendFailure(reply, `The answer at ${settings.url} was unexpected: is that address a Trident?`);
		return { openUrl: `${settings.url}/?model=${encodeURIComponent(modelId)}` };
	});
}
