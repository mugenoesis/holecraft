import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;
let fake: FakeTrident | null = null;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-trident-'));
	app = await createServer({ dataDir: dir });
});

afterEach(async () => {
	await app.close();
	await fake?.close();
	fake = null;
	await rm(dir, { recursive: true, force: true });
});

interface Seen {
	method: string;
	url: string;
	authorization: string | undefined;
	body: Buffer;
}

/** A stand-in for a Trident: records what it is sent and answers as it is told to. */
class FakeTrident {
	readonly seen: Seen[] = [];
	private readonly server: http.Server;
	url = '';

	constructor(private reply: (res: http.ServerResponse, seen: Seen) => void) {
		this.server = http.createServer((req, res) => {
			const chunks: Buffer[] = [];
			req.on('data', (c: Buffer) => chunks.push(c));
			req.on('end', () => {
				const seen = {
					method: req.method ?? '',
					url: req.url ?? '',
					authorization: req.headers.authorization,
					body: Buffer.concat(chunks),
				};
				this.seen.push(seen);
				this.reply(res, seen);
			});
		});
	}

	async start(): Promise<this> {
		await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
		this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
		return this;
	}

	close(): Promise<void> {
		return new Promise((resolve) => {
			this.server.closeAllConnections();
			this.server.close(() => resolve());
		});
	}
}

const accepting =
	(modelId = 'abc123') =>
	(res: http.ServerResponse) => {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ model_id: modelId, filename: 'x.3mf', mesh_report: null }));
	};
const answering =
	(status: number, body: unknown = { detail: 'no' }) =>
	(res: http.ServerResponse) => {
		res.writeHead(status, { 'content-type': 'application/json' });
		res.end(JSON.stringify(body));
	};

async function start(reply: (res: http.ServerResponse, seen: Seen) => void): Promise<FakeTrident> {
	fake = await new FakeTrident(reply).start();
	return fake;
}

const save = (body: Record<string, unknown>) => app.inject({ method: 'PUT', url: '/api/trident', payload: body });
const send = (bytes: Uint8Array | string = 'PK-3mf-bytes', headers: Record<string, string> = {}) =>
	app.inject({
		method: 'POST',
		url: '/api/trident/send',
		payload: Buffer.from(bytes),
		headers: { 'content-type': 'model/3mf', 'x-file-name': 'Cube.3mf', ...headers },
	});

describe('the Trident settings', () => {
	it('start with nothing set', async () => {
		const res = await app.inject({ method: 'GET', url: '/api/trident' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ url: null, hasKey: false });
	});

	it('keep the address and the key, and only ever say whether there is a key', async () => {
		const res = await save({ url: 'http://192.168.1.3:8000', key: 'trident_secret' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ url: 'http://192.168.1.3:8000', hasKey: true });
		const again = await app.inject({ method: 'GET', url: '/api/trident' });
		expect(again.json()).toEqual({ url: 'http://192.168.1.3:8000', hasKey: true });
		expect(JSON.stringify([res.body, again.body])).not.toContain('trident_secret');
	});

	it('are kept on disk, privately, so they survive a restart', async () => {
		await save({ url: 'http://trident.lan:8000', key: 'trident_secret' });
		const file = path.join(dir, 'trident.json');
		expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ url: 'http://trident.lan:8000', key: 'trident_secret' });
		if (process.platform !== 'win32') expect((await stat(file)).mode & 0o077).toBe(0);
		await app.close();
		app = await createServer({ dataDir: dir });
		expect((await app.inject({ method: 'GET', url: '/api/trident' })).json()).toEqual({ url: 'http://trident.lan:8000', hasKey: true });
	});

	it('tidy the address: no trailing slash, a path prefix is kept', async () => {
		expect((await save({ url: ' http://192.168.1.3:8000/ ' })).json().url).toBe('http://192.168.1.3:8000');
		expect((await save({ url: 'https://example.lan/trident/' })).json().url).toBe('https://example.lan/trident');
	});

	it.each([
		'',
		'   ',
		'trident',
		'javascript:alert(1)',
		'ftp://trident.lan',
		'file:///etc/passwd',
		'http://user:pw@trident.lan',
		'http://',
		123,
		null,
	])('refuse %j as an address', async (url) => {
		const res = await save({ url });
		expect(res.statusCode).toBe(400);
		expect(res.json().error).toMatch(/address/i);
		expect((await app.inject({ method: 'GET', url: '/api/trident' })).json().url).toBeNull();
	});

	it('refuse a key that is not text, or is absurdly long', async () => {
		expect((await save({ url: 'http://t.lan', key: 5 })).statusCode).toBe(400);
		expect((await save({ url: 'http://t.lan', key: 'k'.repeat(500) })).statusCode).toBe(400);
	});

	it('keep the key when it is left out, replace it when given, and drop it when empty', async () => {
		await save({ url: 'http://t.lan', key: 'one' });
		expect((await save({ url: 'http://other.lan' })).json()).toEqual({ url: 'http://other.lan', hasKey: true });
		expect(JSON.parse(await readFile(path.join(dir, 'trident.json'), 'utf8')).key).toBe('one');
		await save({ url: 'http://other.lan', key: 'two' });
		expect(JSON.parse(await readFile(path.join(dir, 'trident.json'), 'utf8')).key).toBe('two');
		expect((await save({ url: 'http://other.lan', key: '' })).json()).toEqual({ url: 'http://other.lan', hasKey: false });
	});

	it('can be forgotten', async () => {
		await save({ url: 'http://t.lan', key: 'one' });
		expect((await app.inject({ method: 'DELETE', url: '/api/trident' })).statusCode).toBe(200);
		expect((await app.inject({ method: 'GET', url: '/api/trident' })).json()).toEqual({ url: null, hasKey: false });
		expect((await app.inject({ method: 'DELETE', url: '/api/trident' })).statusCode).toBe(200); // nothing to forget is fine
	});
});

describe('sending a model to Trident', () => {
	it('says it is not set up when there is no address', async () => {
		const res = await send();
		expect(res.statusCode).toBe(409);
		expect(res.json().error).toMatch(/set up/i);
	});

	it('uploads the file with the key and answers with the address to open', async () => {
		const trident = await start(accepting('abc123'));
		await save({ url: trident.url, key: 'trident_secret' });
		const res = await send('PK-the-3mf-bytes');
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ openUrl: `${trident.url}/?model=abc123` });
		expect(trident.seen).toHaveLength(1);
		const [seen] = trident.seen;
		expect(seen?.method).toBe('POST');
		expect(seen?.url).toBe('/models');
		expect(seen?.authorization).toBe('Bearer trident_secret');
		expect(seen?.body.toString('latin1')).toContain('PK-the-3mf-bytes');
		expect(seen?.body.toString('latin1')).toMatch(/name="file"; filename="Cube\.3mf"/);
	});

	it('sends no key when there is none (a Trident with no login needs none)', async () => {
		const trident = await start(accepting());
		await save({ url: trident.url });
		expect((await send()).statusCode).toBe(200);
		expect(trident.seen[0]?.authorization).toBeUndefined();
	});

	it('keeps a path prefix in the address it opens', async () => {
		const trident = await start(accepting('m1'));
		await save({ url: `${trident.url}/trident/` });
		const res = await send();
		expect(res.json().openUrl).toBe(`${trident.url}/trident/?model=m1`);
		expect(trident.seen[0]?.url).toBe('/trident/models');
	});

	it('cleans the file name: a plain name ending .3mf, whatever it was given', async () => {
		const trident = await start(accepting());
		await save({ url: trident.url });
		await send('x', { 'x-file-name': '../../etc/pa ss<wd>.stl' });
		await send('x', { 'x-file-name': '' });
		const names = trident.seen.map((s) => /filename="([^"]*)"/.exec(s.body.toString('latin1'))?.[1]);
		for (const name of names) expect(name).toMatch(/^[\w .()-]+\.3mf$/);
		expect(names[0]).not.toContain('/');
	});

	it('reads the name the page sent percent-encoded (a header cannot carry spaces and accents as they are), keeping letters', async () => {
		const trident = await start(accepting());
		await save({ url: trident.url });
		await send('x', { 'x-file-name': encodeURIComponent('Br\u00fccke 2 (final).3mf') });
		await send('x', { 'x-file-name': '100%.3mf' }); // not valid percent-encoding: used as it is, tidied
		expect(trident.seen[0]?.body.includes(Buffer.from('filename="Br\u00fccke 2 (final).3mf"'))).toBe(true);
		expect(trident.seen[1]?.body.toString('latin1')).toMatch(/filename="100_\.3mf"/);
	});

	it('says the key was not accepted, naming what to check', async () => {
		const trident = await start(answering(401, { detail: 'Invalid API key' }));
		await save({ url: trident.url, key: 'wrong' });
		const res = await send();
		expect(res.statusCode).toBe(502);
		expect(res.json().error).toMatch(/401/);
		expect(res.json().error).toMatch(/key/i);
	});

	it('says the key may not do this, for a 403', async () => {
		const trident = await start(answering(403));
		await save({ url: trident.url, key: 'k' });
		const res = await send();
		expect(res.statusCode).toBe(502);
		expect(res.json().error).toMatch(/403/);
	});

	it('says when the file is too large for Trident', async () => {
		const trident = await start(answering(413));
		await save({ url: trident.url });
		expect((await send()).json().error).toMatch(/too large/i);
	});

	it('passes on what any other answer was', async () => {
		const trident = await start(answering(500));
		await save({ url: trident.url });
		const res = await send();
		expect(res.statusCode).toBe(502);
		expect(res.json().error).toMatch(/500/);
	});

	it('says when Trident cannot be reached, with the address', async () => {
		const trident = await start(accepting());
		await save({ url: trident.url });
		await trident.close();
		fake = null;
		const res = await send();
		expect(res.statusCode).toBe(502);
		expect(res.json().error).toMatch(/reach/i);
		expect(res.json().error).toContain(trident.url);
	});

	it('does not follow a redirect (a POST would be turned into a GET): it says to check the address', async () => {
		const trident = await start((res) => {
			res.writeHead(301, { location: 'https://trident.lan/models' });
			res.end();
		});
		await save({ url: trident.url });
		const res = await send();
		expect(res.statusCode).toBe(502);
		expect(res.json().error).toMatch(/redirect/i);
	});

	it('does not trust an answer without a model', async () => {
		const trident = await start((res) => {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{"hello":"world"}');
		});
		await save({ url: trident.url });
		const res = await send();
		expect(res.statusCode).toBe(502);
		expect(res.json().error).toMatch(/not a Trident|unexpected/i);
	});

	it('refuses an empty file, and anything not sent as a 3MF', async () => {
		const trident = await start(accepting());
		await save({ url: trident.url });
		expect((await send('')).statusCode).toBe(400);
		const res = await app.inject({
			method: 'POST',
			url: '/api/trident/send',
			payload: '{}',
			headers: { 'content-type': 'application/json' },
		});
		expect(res.statusCode).toBe(415);
		expect(trident.seen).toHaveLength(0);
	});
});
