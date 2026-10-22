import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IMPORT_CONTENT_TYPE } from './importRoutes.ts';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-import-'));
	app = await createServer({ dataDir: dir });
});

afterEach(async () => {
	await app.close();
	await rm(dir, { recursive: true, force: true });
});

const send = (name: string | undefined, body: Buffer, extra: Record<string, string> = {}) =>
	app.inject({
		method: 'POST',
		url: '/api/import',
		payload: body,
		headers: {
			'content-type': IMPORT_CONTENT_TYPE,
			'x-holecraft-import': '1',
			...(name === undefined ? {} : { 'x-file-name': encodeURIComponent(name) }),
			...extra,
		},
	});

describe('POST /api/import', () => {
	it('keeps the file and says where to open it', async () => {
		const res = await send('Bracket v2.3mf', Buffer.from([1, 2, 3, 4]));
		expect(res.statusCode).toBe(201);
		const body = res.json<{ id: string; name: string; size: number; openUrl: string }>();
		expect(body).toMatchObject({ name: 'Bracket v2.3mf', size: 4 });
		expect(body.openUrl).toBe(`/import/${body.id}`);
	});

	it('takes a name with spaces, accents and other characters, as the browser would send it', async () => {
		const res = await send('Étagère – naïve (1).stl', Buffer.from([1]));
		expect(res.json<{ name: string }>().name).toBe('Étagère – naïve (1).stl');
	});

	it('cleans a name that tries to leave the folder', async () => {
		const res = await send('../../etc/passwd', Buffer.from([1]));
		expect(res.json<{ name: string }>().name).toBe('passwd');
		const inbox = await readdir(path.join(dir, 'inbox'));
		expect(inbox.every((f) => /^[0-9a-f]{32}\.(bin|json)$/.test(f))).toBe(true);
	});

	it('refuses a request without the header only the add-on sends (a web page cannot add it without the server saying yes)', async () => {
		const res = await app.inject({
			method: 'POST',
			url: '/api/import',
			payload: Buffer.from([1]),
			headers: { 'content-type': IMPORT_CONTENT_TYPE, 'x-file-name': 'a.stl' },
		});
		expect(res.statusCode).toBe(403);
	});

	it('refuses another way of sending it, an empty file, and a name that is not valid text', async () => {
		const plain = await app.inject({
			method: 'POST',
			url: '/api/import',
			payload: Buffer.from([1]),
			headers: { 'content-type': 'application/octet-stream', 'x-holecraft-import': '1', 'x-file-name': 'a.stl' },
		});
		expect(plain.statusCode).toBe(415);
		expect((await send('a.stl', Buffer.alloc(0))).statusCode).toBe(400);
		expect((await send(undefined, Buffer.from([1]))).statusCode).toBe(400);
		const raw = await send('x', Buffer.from([1]), { 'x-file-name': '%E0%A4%A' });
		expect(raw.statusCode).toBe(400);
	});
});

describe('GET and DELETE /api/import/:id', () => {
	const put = async () => (await send('Part.stl', Buffer.from([5, 6, 7]))).json<{ id: string }>().id;

	it('gives the file back with its name', async () => {
		const id = await put();
		const res = await app.inject(`/api/import/${id}`);
		expect(res.statusCode).toBe(200);
		expect([...res.rawPayload]).toEqual([5, 6, 7]);
		expect(decodeURIComponent(String(res.headers['x-file-name']))).toBe('Part.stl');
		expect(res.headers['content-type']).toBe('application/octet-stream');
		expect(res.headers['cache-control']).toBe('no-store');
	});

	it('deletes it, once', async () => {
		const id = await put();
		expect((await app.inject({ method: 'DELETE', url: `/api/import/${id}` })).statusCode).toBe(204);
		expect((await app.inject(`/api/import/${id}`)).statusCode).toBe(404);
		expect((await app.inject({ method: 'DELETE', url: `/api/import/${id}` })).statusCode).toBe(404);
	});

	it('answers 404 for an id that is not there or not an id', async () => {
		expect((await app.inject('/api/import/0123456789abcdef0123456789abcdef')).statusCode).toBe(404);
		expect((await app.inject('/api/import/..%2F..%2Fetc')).statusCode).toBe(404);
	});
});

describe('big files', () => {
	it('takes a file over 100 MB (a model of two million triangles is about that)', async () => {
		const res = await send('Big.stl', Buffer.alloc(101 * 1024 * 1024, 1));
		expect(res.statusCode).toBe(201);
		const { id, size } = res.json<{ id: string; size: number }>();
		expect(size).toBe(101 * 1024 * 1024);
		const back = await app.inject(`/api/import/${id}`);
		expect(back.rawPayload.length).toBe(101 * 1024 * 1024);
	}, 60_000);

	it('refuses a file over 200 MB', async () => {
		const res = await send('Huge.stl', Buffer.alloc(201 * 1024 * 1024, 1));
		expect(res.statusCode).toBe(413);
	}, 60_000);
});
