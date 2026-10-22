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

describe('PUT /api/designs/:id from a page that says which version it was based on', () => {
	const put = (d: Design, body: unknown, base?: string) =>
		app.inject({
			method: 'PUT',
			url: `/api/designs/${d.id}`,
			payload: JSON.stringify(body),
			headers: { 'content-type': 'application/json', ...(base === undefined ? {} : { 'x-base-updated-at': base }) },
		});

	it('saves when the base is the stored version, and answers the new one', async () => {
		const d = await create();
		const res = await put(d, addShape(d, 'box', [0, 0]).design, d.updatedAt);
		expect(res.statusCode).toBe(200);
		expect(res.json<Design>().updatedAt).not.toBe(d.updatedAt);
	});

	it('answers 409 with the stored time and a message in words when the design was changed since, and changes nothing', async () => {
		const d = await create();
		const other = (await put(d, addShape(d, 'box', [0, 0]).design)).json<Design>();
		const res = await put(d, addShape(addShape(d, 'box', [0, 0]).design, 'sphere', [50, 0]).design, d.updatedAt);
		expect(res.statusCode).toBe(409);
		expect(res.json<{ error: string; updatedAt: string }>().updatedAt).toBe(other.updatedAt);
		expect(res.json<{ error: string }>().error).toMatch(/changed somewhere else/i);
		const stored = (await app.inject({ method: 'GET', url: `/api/designs/${d.id}` })).json<Design>();
		expect(stored.roots).toHaveLength(1);
	});

	it('saves over the other version when based on its time (keeping one\u2019s own)', async () => {
		const d = await create();
		const other = (await put(d, addShape(d, 'box', [0, 0]).design)).json<Design>();
		const res = await put(d, addShape(addShape(d, 'box', [0, 0]).design, 'sphere', [50, 0]).design, other.updatedAt);
		expect(res.statusCode).toBe(200);
		expect(res.json<Design>().roots).toHaveLength(2);
	});

	it('checks nothing without the header', async () => {
		const d = await create();
		await put(d, addShape(d, 'box', [0, 0]).design);
		expect((await put(d, addShape(d, 'sphere', [0, 0]).design)).statusCode).toBe(200);
	});

	it('is 400, not 409, for a base that is not a time at all', async () => {
		const d = await create();
		expect((await put(d, d, 'not a time')).statusCode).toBe(400);
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

describe('folders', () => {
	const patch = (id: string, body: unknown) => app.inject({ method: 'PATCH', url: `/api/designs/${id}`, ...json(body) });
	const summaries = async () => (await app.inject('/api/designs')).json<{ id: string; name: string; folder?: string }[]>();

	it('PATCH puts a design in a folder, shows it in the list, and takes it out with null', async () => {
		const d = await create('Bracket');
		const moved = await patch(d.id, { folder: 'Printer parts' });
		expect(moved.statusCode).toBe(200);
		expect(moved.json<Design>().folder).toBe('Printer parts');
		expect((await summaries())[0]?.folder).toBe('Printer parts');
		expect((await patch(d.id, { folder: null })).json<Design>().folder).toBeUndefined();
		expect((await summaries())[0]?.folder).toBeUndefined();
	});

	it('PATCH can rename and move at once, and a folder that is not text is refused', async () => {
		const d = await create('Old');
		const both = (await patch(d.id, { name: 'New', folder: 'Home' })).json<Design>();
		expect(both).toMatchObject({ name: 'New', folder: 'Home' });
		for (const folder of [5, {}, ['x']]) expect((await patch(d.id, { folder })).statusCode, JSON.stringify(folder)).toBe(400);
	});

	it('PATCH on an unknown design is 404, also when it only moves it', async () => {
		expect((await patch('0123456789abcdef0123456789abcdef', { folder: 'x' })).statusCode).toBe(404);
	});

	it('a save from the editor does not change the folder', async () => {
		const d = await create('A');
		await patch(d.id, { folder: 'Home' });
		const res = await app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json({ ...d, folder: 'Elsewhere' }) });
		expect(res.json<Design>().folder).toBe('Home');
	});

	it('renames a folder for all the designs in it', async () => {
		const a = await create('A');
		const b = await create('B');
		await patch(a.id, { folder: 'Old' });
		await patch(b.id, { folder: 'Old' });
		const res = await app.inject({ method: 'POST', url: '/api/design-folders/rename', ...json({ from: 'Old', to: 'New' }) });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ moved: 2 });
		expect((await summaries()).map((s) => s.folder)).toEqual(['New', 'New']);
	});

	it('refuses a folder rename with a blank or missing name', async () => {
		for (const body of [{ from: 'Old', to: '  ' }, { from: 'Old' }, { to: 'x' }, { from: 5, to: 'x' }, {}]) {
			const res = await app.inject({ method: 'POST', url: '/api/design-folders/rename', ...json(body) });
			expect(res.statusCode, JSON.stringify(body)).toBe(400);
		}
	});

	it('takes a folder apart and keeps its designs', async () => {
		const a = await create('A');
		await patch(a.id, { folder: 'Gone' });
		const res = await app.inject({ method: 'POST', url: '/api/design-folders/remove', ...json({ name: 'Gone' }) });
		expect(res.json()).toEqual({ moved: 1 });
		expect((await summaries())[0]).toMatchObject({ name: 'A' });
		expect((await summaries())[0]?.folder).toBeUndefined();
		expect((await app.inject({ method: 'POST', url: '/api/design-folders/remove', ...json({}) })).statusCode).toBe(400);
	});
});

describe('version history', () => {
	const save = (d: Design) => app.inject({ method: 'PUT', url: `/api/designs/${d.id}`, ...json(d) });

	it('starts empty, then lists how the design stood before it was first saved', async () => {
		const d = await create('Bracket');
		expect((await app.inject(`/api/designs/${d.id}/versions`)).json()).toEqual([]);
		await save(addShape(d, 'box', [0, 0]).design);
		const list = (await app.inject(`/api/designs/${d.id}/versions`)).json<
			{ version: string; name: string; objectCount: number; savedAt: string }[]
		>();
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ name: 'Bracket', objectCount: 0, savedAt: d.updatedAt });
		expect(list[0]?.version).toMatch(/^\d+$/);
	});

	it('restores a version as the design, which then has the earlier contents', async () => {
		const d = await create('Bracket');
		await save(addShape(d, 'box', [0, 0]).design);
		const [first] = (await app.inject(`/api/designs/${d.id}/versions`)).json<{ version: string }[]>();
		const res = await app.inject({ method: 'POST', url: `/api/designs/${d.id}/versions/${first?.version}/restore` });
		expect(res.statusCode).toBe(200);
		expect(res.json<Design>().roots).toHaveLength(0);
		expect((await app.inject(`/api/designs/${d.id}`)).json<Design>().roots).toHaveLength(0);
		// and the box that was just undone is one restore away
		expect((await app.inject(`/api/designs/${d.id}/versions`)).json<{ objectCount: number }[]>().map((v) => v.objectCount)).toEqual([1, 0]);
	});

	it('answers 404 for a design or version that is not there, and 404 for a version that is not an address', async () => {
		const d = await create('Bracket');
		expect((await app.inject({ method: 'POST', url: `/api/designs/${d.id}/versions/1767261600000/restore` })).statusCode).toBe(404);
		expect((await app.inject({ method: 'POST', url: `/api/designs/${d.id}/versions/..%2Fx/restore` })).statusCode).toBe(404);
		expect(
			(await app.inject({ method: 'POST', url: '/api/designs/0123456789abcdef0123456789abcdef/versions/1767261600000/restore' }))
				.statusCode,
		).toBe(404);
		expect((await app.inject('/api/designs/0123456789abcdef0123456789abcdef/versions')).statusCode).toBe(404);
	});

	it('is gone when the design is deleted', async () => {
		const d = await create('Bracket');
		await save(addShape(d, 'box', [0, 0]).design);
		await app.inject({ method: 'DELETE', url: `/api/designs/${d.id}` });
		expect((await app.inject(`/api/designs/${d.id}/versions`)).statusCode).toBe(404);
	});
});
