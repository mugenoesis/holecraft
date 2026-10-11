import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addShape, createEmptyDesign, type Design } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-api-'));
	app = await createServer({ dataDir: dir });
});

afterEach(async () => {
	await app.close();
	await rm(dir, { recursive: true, force: true });
});

const json = (payload: unknown) => ({ payload: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });

async function create(name?: string): Promise<Design> {
	const res = await app.inject({ method: 'POST', url: '/api/designs', ...json(name ? { name } : {}) });
	expect(res.statusCode).toBe(201);
	return res.json<Design>();
}

describe('GET /api/designs', () => {
	it('starts empty', async () => {
		const res = await app.inject('/api/designs');
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual([]);
	});

	it('lists summaries, newest first, without the contents of the designs', async () => {
		const a = await create('First');
		await new Promise((r) => setTimeout(r, 5));
		const b = await create('Second');
		const list = (await app.inject('/api/designs')).json<Array<Record<string, unknown>>>();
		expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
		expect(Object.keys(list[0]!).sort()).toEqual(['createdAt', 'id', 'name', 'objectCount', 'updatedAt']);
	});
});

describe('POST /api/designs', () => {
	it('creates an empty design and returns it', async () => {
		const d = await create();
		expect(d).toMatchObject({ name: 'Untitled design', roots: [], units: 'mm' });
		expect(d.id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('takes an optional name', async () => {
		expect((await create('Gear')).name).toBe('Gear');
	});

	it('works with no body at all', async () => {
		const res = await app.inject({ method: 'POST', url: '/api/designs' });
		expect(res.statusCode).toBe(201);
	});

	it('rejects a name that is not text', async () => {
		const res = await app.inject({ method: 'POST', url: '/api/designs', ...json({ name: 42 }) });
		expect(res.statusCode).toBe(400);
	});
});

describe('GET /api/designs/:id', () => {
	it('returns the design', async () => {
		const d = await create('Plate');
		const res = await app.inject(`/api/designs/${d.id}`);
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual(d);
	});

	it('is 404 for an unknown design and for anything that is not a design id', async () => {
		for (const id of ['0123456789abcdef0123456789abcdef', 'nope']) {
			const res = await app.inject(`/api/designs/${id}`);
			expect(res.statusCode, id).toBe(404);
			expect(res.json()).toEqual({ error: 'Design not found' });
		}
	});

	it('never lets an id walk out of the designs folder', async () => {
		// Depending on how the router reads these they are either not a route at all or not a design id;
		// either way they must be a plain JSON 404 and never reach the file system.
		for (const id of ['..%2F..%2Fetc%2Fpasswd', '%2e%2e', '..%5C..%5Cwindows', '%00']) {
			const res = await app.inject(`/api/designs/${id}`);
			expect(res.statusCode, id).toBe(404);
			expect(res.json<{ error: string }>().error).toBeTruthy();
		}
	});

	it('reports a damaged file as a server problem, naming the design but not the file path', async () => {
		const d = await create();
		await writeFile(path.join(dir, 'designs', `${d.id}.json`), '{ broken');
		const res = await app.inject(`/api/designs/${d.id}`);
		expect(res.statusCode).toBe(500);
		expect(res.json<{ error: string }>().error).toContain(d.id);
		expect(res.body).not.toContain(dir);
	});
});

describe('PUT /api/designs/:id', () => {
	it('saves the design', async () => {
		const d = await create();
		const edited = addShape(d, 'box', [5, 5]).design;
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json(edited) });
		expect(res.statusCode).toBe(200);
		expect(res.json<Design>().roots).toHaveLength(1);
		expect((await app.inject(`/api/designs/${d.id}`)).json<Design>().roots).toHaveLength(1);
	});

	it("returns the saved design with the server's modification time", async () => {
		const d = await create();
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json({ ...d, updatedAt: '1999-01-01T00:00:00.000Z' }) });
		expect(res.json<Design>().updatedAt).not.toBe('1999-01-01T00:00:00.000Z');
	});

	it('rejects an invalid design with a 400 that says what is wrong', async () => {
		const d = await create();
		const bad = { ...d, roots: ['ghost'] };
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json(bad) });
		expect(res.statusCode).toBe(400);
		expect(res.json<{ error: string; path: string }>().error).toContain('ghost');
		expect((await app.inject(`/api/designs/${d.id}`)).json<Design>().roots).toEqual([]);
	});

	it("rejects a design saved under another design's id", async () => {
		const [a, b] = [await create(), await create()];
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${a.id}`, ...json(b) });
		expect(res.statusCode).toBe(400);
	});

	it('rejects things that are not designs', async () => {
		const d = await create();
		for (const body of [[], 'text', 7, null]) {
			const res = await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json(body) });
			expect(res.statusCode, JSON.stringify(body)).toBe(400);
		}
	});

	it('rejects malformed JSON', async () => {
		const d = await create();
		const res = await app.inject({
			method: 'PUT',
			url: `/api/designs/${d.id}`,
			payload: '{ nope',
			headers: { 'content-type': 'application/json' },
		});
		expect(res.statusCode).toBe(400);
		expect(res.json<{ error: string }>().error).toBeTruthy();
	});

	it('is 404 for a design that does not exist, and does not create it', async () => {
		const ghost = createEmptyDesign('0123456789abcdef0123456789abcdef');
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${ghost.id}`, ...json(ghost) });
		expect(res.statusCode).toBe(404);
		expect((await app.inject('/api/designs')).json()).toEqual([]);
	});

	it('refuses a body that is far too large', async () => {
		const d = await create();
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json({ ...d, padding: 'x'.repeat(9 * 1024 * 1024) }) });
		expect(res.statusCode).toBe(413);
		expect(res.json<{ error: string }>().error).toMatch(/large/i);
	});
});

describe('PATCH /api/designs/:id', () => {
	it('renames and returns the design', async () => {
		const d = await create('Old');
		const res = await app.inject({ method: 'PATCH', url: `/api/designs/${d.id}`, ...json({ name: 'New' }) });
		expect(res.statusCode).toBe(200);
		expect(res.json<Design>().name).toBe('New');
		expect((await app.inject(`/api/designs/${d.id}`)).json<Design>().name).toBe('New');
	});

	it('rejects a blank or missing name', async () => {
		const d = await create();
		for (const body of [{ name: '   ' }, {}, { name: 5 }]) {
			const res = await app.inject({ method: 'PATCH', url: `/api/designs/${d.id}`, ...json(body) });
			expect(res.statusCode, JSON.stringify(body)).toBe(400);
		}
	});

	it('is 404 for an unknown design', async () => {
		const res = await app.inject({ method: 'PATCH', url: '/api/designs/0123456789abcdef0123456789abcdef', ...json({ name: 'x' }) });
		expect(res.statusCode).toBe(404);
	});
});

describe('POST /api/designs/:id/duplicate', () => {
	it('copies a design', async () => {
		const d = await create('Gear');
		const res = await app.inject({ method: 'POST', url: `/api/designs/${d.id}/duplicate` });
		expect(res.statusCode).toBe(201);
		const copy = res.json<Design>();
		expect(copy.id).not.toBe(d.id);
		expect(copy.name).toBe('Copy of Gear');
		expect((await app.inject('/api/designs')).json<unknown[]>()).toHaveLength(2);
	});

	it('is 404 for an unknown design', async () => {
		const res = await app.inject({ method: 'POST', url: '/api/designs/0123456789abcdef0123456789abcdef/duplicate' });
		expect(res.statusCode).toBe(404);
	});
});

describe('DELETE /api/designs/:id', () => {
	it('deletes a design', async () => {
		const d = await create();
		const res = await app.inject({ method: 'DELETE', url: `/api/designs/${d.id}` });
		expect(res.statusCode).toBe(204);
		expect(res.body).toBe('');
		expect((await app.inject(`/api/designs/${d.id}`)).statusCode).toBe(404);
	});

	it('is 404 the second time, and for ids that are not ids', async () => {
		const d = await create();
		await app.inject({ method: 'DELETE', url: `/api/designs/${d.id}` });
		expect((await app.inject({ method: 'DELETE', url: `/api/designs/${d.id}` })).statusCode).toBe(404);
		expect((await app.inject({ method: 'DELETE', url: '/api/designs/..%2F..%2Fx' })).statusCode).toBe(404);
	});
});

describe('persistence', () => {
	it('a new server on the same folder sees everything that was saved', async () => {
		const d = await create('Kept');
		await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json(addShape(d, 'sphere', [1, 2]).design) });
		const second = await createServer({ dataDir: dir });
		const res = await second.inject(`/api/designs/${d.id}`);
		expect(res.json<Design>()).toMatchObject({ name: 'Kept', roots: [expect.any(String)] });
		await second.close();
	});

	it('serves JSON', async () => {
		expect((await app.inject('/api/designs')).headers['content-type']).toContain('application/json');
	});
});
