import type { FastifyInstance, FastifyReply } from 'fastify';
import { isObject, sendableName, sendFailure, type TridentSettings, type TridentStore, unreachable } from './trident.ts';

/**
 * Support points for resin printing, through the same saved Trident as Send to Trident: which printers Trident can write files for, the
 * points the slicer would use for a model, and storing the points the user ended up with against Trident's copy of the model. The page
 * never talks to Trident itself (see trident.ts).
 */

/** Placing points on a complex model takes the slicer a while. */
const SUPPORTS_TIMEOUT_MS = 10 * 60_000;
const CALL_TIMEOUT_MS = 60_000;
/** The biggest model sent to be looked at (Trident takes up to 500 MB). */
const MAX_MODEL_BYTES = 200 * 1024 * 1024;
const MAX_POINTS_BYTES = 20 * 1024 * 1024;
const MAX_PRINTER_LENGTH = 200;
const MODEL_ID = /^[A-Za-z0-9_-]{1,64}$/;

const auth = (settings: TridentSettings): Record<string, string> => (settings.key ? { authorization: `Bearer ${settings.key}` } : {});

/** Sends a request to the Trident; null when it cannot be reached. A redirect is not followed (a POST would turn into a GET). */
async function call(settings: TridentSettings, path: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
	try {
		return await fetch(`${settings.url}${path}`, {
			...init,
			headers: { ...auth(settings), ...(init.headers as Record<string, string> | undefined) },
			redirect: 'manual',
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch {
		return null;
	}
}

/** Trident's own reason for a 422 (the model does not fit, the points are not usable). */
async function reasonOf(response: Response, fallback: string): Promise<string> {
	const why = await response
		.json()
		.then((j: unknown) => (isObject(j) && typeof j.detail === 'string' ? j.detail : null))
		.catch(() => null);
	return why ?? fallback;
}

/** What to tell the user when Trident answered with something other than success. `what` says what was being asked, for the 403 and 404. */
function refusal(status: number, what: { forbidden: string; missing: string }): string {
	if (status === 401)
		return 'Trident did not accept the API key (401). Check it in Trident under API keys, or change it in Trident settings.';
	if (status === 403) return what.forbidden;
	if (status === 404) return what.missing;
	if (status === 413) return 'The model is too large for Trident.';
	if (status >= 300 && status < 400)
		return 'Trident redirected the request (check the address: use the one your browser ends up on, such as the https one).';
	return `Trident answered ${status}.`;
}

const PRINTERS = {
	forbidden:
		'Trident says this API key may not list the resin printers (403). Make a key in Trident under API keys with "Holecraft resin tools", or a full-access one.',
	missing: 'This Trident cannot place supports: update it to its latest version.',
};
const SUPPORTS = {
	forbidden:
		'Trident says this API key is not allowed to place supports (403). Make a key in Trident under API keys with "Holecraft resin tools: upload models, hollow them, place supports", or a full-access one.',
	missing: 'This Trident cannot place supports: update it to its latest version.',
};
const STORE = {
	forbidden:
		'Trident says this API key is not allowed to keep support points (403). Make a key in Trident under API keys with "Holecraft resin tools: upload models, hollow them, place supports", or a full-access one.',
	missing:
		'Trident no longer has this model (or is too old to keep support points): send it again, and update Trident if it keeps happening.',
};

async function notSetUp(store: TridentStore, reply: FastifyReply): Promise<TridentSettings | null> {
	const settings = await store.get();
	if (!settings) await reply.code(409).send({ error: 'Trident is not set up yet: give its address first' });
	return settings;
}

/** Why a response from Trident is not usable, sent to the page: its own reason for a 422, else what to do. */
async function relay(reply: FastifyReply, response: Response, what: { forbidden: string; missing: string }, fallback422: string) {
	if (response.status === 422) return reply.code(422).send({ error: await reasonOf(response, fallback422) });
	return sendFailure(reply, refusal(response.status, what));
}

type SupportsRequest = { body: Buffer; printer: string; stl: boolean } | { code: 400 | 415; error: string };

/** What was asked of the supports route: the model as the body (a 3MF or an STL), the printer in the query; or what is wrong with it. */
function supportsRequest(body: unknown, rawQuery: unknown, contentType: unknown): SupportsRequest {
	if (!Buffer.isBuffer(body)) return { code: 415, error: 'Send the model as model/3mf or model/stl' };
	if (body.length === 0) return { code: 400, error: 'There is nothing to place supports on' };
	const query = isObject(rawQuery) ? rawQuery : {};
	const printer = typeof query.printer === 'string' ? query.printer.trim() : '';
	if (!printer || printer.length > MAX_PRINTER_LENGTH) return { code: 400, error: 'Choose the printer the points are for' };
	return { body, printer, stl: contentType === 'model/stl' };
}

export function registerSupportRoutes(app: FastifyInstance, store: TridentStore): void {
	app.get('/api/trident/resin-printers', async (_request, reply) => {
		const settings = await notSetUp(store, reply);
		if (!settings) return;
		const response = await call(settings, '/resin/printers', {}, CALL_TIMEOUT_MS);
		if (!response) return sendFailure(reply, unreachable(settings));
		if (!response.ok) return relay(reply, response, PRINTERS, 'Trident could not list its printers');
		const list: unknown = await response.json().catch(() => null);
		if (!Array.isArray(list)) return sendFailure(reply, `The answer at ${settings.url} was unexpected: is that address a Trident?`);
		return list
			.filter(
				(p): p is { name: string; vendor: string; supported: true } => isObject(p) && typeof p.name === 'string' && p.supported === true,
			)
			.map((p) => ({ name: p.name, vendor: typeof p.vendor === 'string' ? p.vendor : '' }));
	});

	app.post('/api/trident/supports', { bodyLimit: MAX_MODEL_BYTES }, async (request, reply) => {
		const asked = supportsRequest(request.body, request.query, request.headers['content-type']);
		if ('error' in asked) return reply.code(asked.code).send({ error: asked.error });
		const settings = await notSetUp(store, reply);
		if (!settings) return;

		const form = new FormData();
		form.append('file', new Blob([new Uint8Array(asked.body)]), sendableName(request.headers['x-file-name'], asked.stl ? 'stl' : '3mf'));
		form.append('printer', asked.printer);
		const response = await call(settings, '/resin/supports', { method: 'POST', body: form }, SUPPORTS_TIMEOUT_MS);
		if (!response) return sendFailure(reply, unreachable(settings));
		if (!response.ok) return relay(reply, response, SUPPORTS, 'Trident could not place supports on this model');
		const points: unknown = await response.json().catch(() => null);
		if (!isObject(points) || !Array.isArray(points.objects)) {
			return sendFailure(reply, `The answer at ${settings.url} was unexpected: is that address a Trident?`);
		}
		return points;
	});

	app.put('/api/trident/support-points', { bodyLimit: MAX_POINTS_BYTES }, async (request, reply) => {
		const query = isObject(request.query) ? request.query : {};
		const model = typeof query.model === 'string' ? query.model : '';
		if (!MODEL_ID.test(model)) return reply.code(400).send({ error: 'Say which model on Trident the points are for' });
		if (!isObject(request.body) || !Array.isArray(request.body.objects)) {
			return reply.code(400).send({ error: 'Send the points as {"objects": [{"points": [...]}]}' });
		}
		const settings = await notSetUp(store, reply);
		if (!settings) return;

		const response = await call(
			settings,
			`/models/${encodeURIComponent(model)}/support-points`,
			{ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) },
			CALL_TIMEOUT_MS,
		);
		if (!response) return sendFailure(reply, unreachable(settings));
		if (!response.ok) return relay(reply, response, STORE, 'Trident would not keep these support points');
		const count = await response
			.json()
			.then((j: unknown) => (isObject(j) && typeof j.support_point_count === 'number' ? j.support_point_count : 0))
			.catch(() => 0);
		return { count };
	});
}
