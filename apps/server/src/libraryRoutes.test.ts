import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addShape, createEmptyDesign, type Design, groupNodes, type LibrarySummary, libraryShapeOf } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-lib-'));
	app = await createServer({ dataDir: dir });
});
afterEach(async () => {
	await app.close();
	await rm(dir, { recursive: true, force: true });
});

const json = (payload: unknown) => ({ payload: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
const shape = (name = 'Bracket'): Design => {
	let d = addShape(createEmptyDesign('d'), 'box', [30, 0], { id: 'a' }).design;
	d = addShape(d, 'cylinder', [30, 0], { id: 'b' }).design;
	d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
	return libraryShapeOf(d, 'g', name)!;
};
async function save(name = 'Bracket'): Promise<LibrarySummary> {
	const res = await app.inject({ method: 'POST', url: '/api/library', ...json({ name, design: shape(name) }) });
	expect(res.statusCode).toBe(201);
	return res.json<LibrarySummary>();
}

describe('the library API', () => {
	it('starts empty', async () => {
		const res = await app.inject('/api/library');
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual([]);
	});

	it('saves a shape under a new id, and lists it with its name and colour but not its contents, newest first', async () => {
		const a = await save('First');
		await new Promise((r) => setTimeout(r, 5));
		const b = await save('Second');
		expect(a.id).toMatch(/^[0-9a-f]{32}$/);
		expect(a).toMatchObject({ name: 'First', color: expect.stringMatching(/^#[0-9a-f]{6}$/) });
		const list = (await app.inject('/api/library')).json<LibrarySummary[]>();
		expect(list.map((s) => s.name)).toEqual(['Second', 'First']);
		expect(Object.keys(list[0]!).sort()).toEqual(['color', 'createdAt', 'id', 'name']);
		expect(b.id).not.toBe(a.id);
	});

	it('gives back what was saved, as a design with the saved name and id and one root', async () => {
		const { id } = await save('Bracket');
		const res = await app.inject(`/api/library/${id}`);
		expect(res.statusCode).toBe(200);
		const got = res.json<Design>();
		expect(got).toMatchObject({ id, name: 'Bracket' });
		expect(got.roots).toHaveLength(1);
		expect(Object.keys(got.nodes)).toHaveLength(3);
	});

	it('is kept apart from the designs: a saved shape is not in the designs list', async () => {
		await save();
		expect((await app.inject('/api/designs')).json()).toEqual([]);
		expect(await readdir(path.join(dir, 'library'))).toHaveLength(1);
	});

	it('refuses what is not a single shape or group: nothing saved, no root, two roots, a broken design, a blank name', async () => {
		const empty = await app.inject({ method: 'POST', url: '/api/library', ...json({ name: 'x', design: createEmptyDesign('e') }) });
		expect(empty.statusCode).toBe(400);
		const two = { ...shape(), roots: ['g', 'g'] };
		expect((await app.inject({ method: 'POST', url: '/api/library', ...json({ name: 'x', design: two }) })).statusCode).toBe(400);
		expect((await app.inject({ method: 'POST', url: '/api/library', ...json({ name: 'x', design: { nonsense: true } }) })).statusCode).toBe(
			400,
		);
		expect((await app.inject({ method: 'POST', url: '/api/library', ...json({ name: '   ', design: shape() }) })).statusCode).toBe(400);
		expect((await app.inject({ method: 'POST', url: '/api/library', ...json({ design: shape() }) })).statusCode).toBe(400);
		expect((await app.inject('/api/library')).json()).toEqual([]);
	});

	it('renames, and refuses a blank name or a missing entry', async () => {
		const { id } = await save('Old');
		const res = await app.inject({ method: 'PATCH', url: `/api/library/${id}`, ...json({ name: '  New name ' }) });
		expect(res.statusCode).toBe(200);
		expect((await app.inject(`/api/library/${id}`)).json<Design>().name).toBe('New name');
		expect((await app.inject({ method: 'PATCH', url: `/api/library/${id}`, ...json({ name: ' ' }) })).statusCode).toBe(400);
		expect((await app.inject({ method: 'PATCH', url: `/api/library/${'0'.repeat(32)}`, ...json({ name: 'x' }) })).statusCode).toBe(404);
	});

	it('deletes, once', async () => {
		const { id } = await save();
		expect((await app.inject({ method: 'DELETE', url: `/api/library/${id}` })).statusCode).toBe(204);
		expect((await app.inject(`/api/library/${id}`)).statusCode).toBe(404);
		expect((await app.inject({ method: 'DELETE', url: `/api/library/${id}` })).statusCode).toBe(404);
		expect((await app.inject('/api/library')).json()).toEqual([]);
	});

	it('does not let an id be a path: anything but 32 hex digits is not found', async () => {
		expect((await app.inject('/api/library/..%2Fdesigns')).statusCode).toBe(404);
		expect((await app.inject('/api/library/not-an-id')).statusCode).toBe(404);
		expect((await app.inject({ method: 'DELETE', url: '/api/library/not-an-id' })).statusCode).toBe(404);
	});
});
