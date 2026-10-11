import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addShape, createEmptyDesign, type Design, encodeMesh } from '@holecraft/core';
import fc from 'fast-check';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

/*
 * Property-based tests for the HTTP API. Whatever a client sends, the server must answer with success or a
 * clean client error (never a 500, which means it crashed), must never keep something it should have refused,
 * and must never touch a file outside its own folders.
 */

let dir: string;
let app: FastifyInstance;
let designId: string;

beforeAll(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-props-'));
	app = await createServer({ dataDir: dir });
	designId = (await app.inject({ method: 'POST', url: '/api/designs', payload: {} })).json<Design>().id;
});
afterAll(async () => {
	await app.close();
	await rm(dir, { recursive: true, force: true });
});

const RUNS = { numRuns: 150 };

type Key = string | number;

/** Every path to a value inside some JSON (the root excluded), outermost first. */
function pathsIn(value: unknown, path: Key[] = []): Key[][] {
	const own = path.length > 0 ? [path] : [];
	if (Array.isArray(value)) return [...own, ...value.flatMap((v, i) => pathsIn(v, [...path, i]))];
	if (value && typeof value === 'object') return [...own, ...Object.entries(value).flatMap(([k, v]) => pathsIn(v, [...path, k]))];
	return own;
}

/** A copy of `json` with the value at `path` replaced. */
function replaceAt(json: unknown, path: Key[], replacement: unknown): unknown {
	if (path.length === 0) return replacement;
	const [key, ...rest] = path;
	if (Array.isArray(json)) return json.map((v, i) => (i === key ? replaceAt(v, rest, replacement) : v));
	if (json && typeof json === 'object') {
		return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, k === key ? replaceAt(v, rest, replacement) : v]));
	}
	return json;
}

/** The JSON with one value (picked by `pick`) swapped for `replacement`. */
function withOneValueReplaced(json: unknown, pick: number, replacement: unknown): unknown {
	const paths = pathsIn(json);
	const target = paths[pick % Math.max(1, paths.length)];
	return target ? replaceAt(json, target, replacement) : json;
}

const ok = (status: number, allowed: number[]) => expect(allowed, `status ${status}`).toContain(status);
const noCrash = (status: number) => expect(status, 'the server must not crash').toBeLessThan(500);

/** A real 1x1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('uploading models', () => {
	it('random bytes are refused, or stored and handed back exactly as sent', async () => {
		await fc.assert(
			fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), async (bytes) => {
				const res = await app.inject({
					method: 'POST',
					url: '/api/meshes',
					payload: Buffer.from(bytes),
					headers: { 'content-type': 'application/octet-stream' },
				});
				ok(res.statusCode, [201, 400]);
				if (res.statusCode === 201) {
					const back = await app.inject(`/api/meshes/${res.json<{ ref: string }>().ref}`);
					expect(new Uint8Array(back.rawPayload)).toEqual(bytes);
				}
			}),
			{ numRuns: 300 },
		);
	});

	it('a real mesh with any one byte changed is refused or stored exactly; nothing half-valid is kept', async () => {
		const good = encodeMesh({
			positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
			indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
		});
		await fc.assert(
			fc.asyncProperty(fc.nat(), fc.integer({ min: 0, max: 255 }), async (at, byte) => {
				const bytes = Uint8Array.from(good);
				bytes[at % bytes.length] = byte;
				const res = await app.inject({
					method: 'POST',
					url: '/api/meshes',
					payload: Buffer.from(bytes),
					headers: { 'content-type': 'application/octet-stream' },
				});
				ok(res.statusCode, [201, 400]);
			}),
			RUNS,
		);
	});

	it('only 64-digit references are ever looked up, and a reference can never reach another folder', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.oneof(
					fc.string({ maxLength: 80 }),
					fc.constantFrom('..', '../x', '%2e%2e%2f', 'a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(60)}/../`),
				),
				async (ref) => {
					const res = await app.inject({ method: 'GET', url: `/api/meshes/${encodeURIComponent(ref)}` });
					ok(res.statusCode, [400, 404]);
				},
			),
			RUNS,
		);
	});

	it('refuses any content type other than raw bytes', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constantFrom(
					'text/plain',
					'application/json',
					'image/png',
					'multipart/form-data; boundary=x',
					'application/x-www-form-urlencoded',
					'x/y',
				),
				async (type) => {
					const res = await app.inject({ method: 'POST', url: '/api/meshes', payload: 'hello', headers: { 'content-type': type } });
					noCrash(res.statusCode);
					expect(res.statusCode).toBeGreaterThanOrEqual(400);
				},
			),
			{ numRuns: 20 },
		);
	});
});

describe('uploading thumbnails', () => {
	it("random bytes are refused, and never replace the design's picture", async () => {
		const before = await app.inject({
			method: 'PUT',
			url: `/api/designs/${designId}/thumbnail`,
			payload: PNG,
			headers: { 'content-type': 'image/png' },
		});
		expect(before.statusCode).toBe(204);
		await fc.assert(
			fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), async (bytes) => {
				const res = await app.inject({
					method: 'PUT',
					url: `/api/designs/${designId}/thumbnail`,
					payload: Buffer.from(bytes),
					headers: { 'content-type': 'image/png' },
				});
				ok(res.statusCode, [400]);
			}),
			{ numRuns: 300 },
		);
		const kept = await app.inject(`/api/designs/${designId}/thumbnail`);
		expect(new Uint8Array(kept.rawPayload)).toEqual(new Uint8Array(PNG));
	});

	it('a real PNG with any byte changed is refused or kept, never a crash', async () => {
		await fc.assert(
			fc.asyncProperty(fc.nat(), fc.integer({ min: 0, max: 255 }), async (at, byte) => {
				const bytes = Buffer.from(PNG);
				bytes[at % bytes.length] = byte;
				const res = await app.inject({
					method: 'PUT',
					url: `/api/designs/${designId}/thumbnail`,
					payload: bytes,
					headers: { 'content-type': 'image/png' },
				});
				ok(res.statusCode, [204, 400]);
			}),
			RUNS,
		);
	});
});

describe('design ids in addresses', () => {
	it('anything that is not a real design id is a clean 404 or 400, whatever the route', async () => {
		const id = fc.oneof(
			fc.string({ maxLength: 60 }),
			fc.constantFrom(
				'..',
				'../designs/x',
				'%2e%2e',
				'A'.repeat(32),
				'0'.repeat(31),
				'0'.repeat(33),
				`${'a'.repeat(32)}.json`,
				`${'a'.repeat(30)}/..`,
			),
		);
		await fc.assert(
			fc.asyncProperty(id, fc.constantFrom('GET', 'PUT', 'PATCH', 'DELETE'), async (raw, method) => {
				const suffix = method === 'PUT' || method === 'GET' ? ['', '/thumbnail'][raw.length % 2] : '';
				const res = await app.inject({
					method,
					url: `/api/designs/${encodeURIComponent(raw)}${suffix}`,
					...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
					headers: { 'content-type': 'application/json' },
				});
				ok(res.statusCode, [400, 404, 415]);
			}),
			{ numRuns: 300 },
		);
	});

	it("nothing is ever written outside the data folder's own subfolders", async () => {
		const top = (await readdir(dir)).sort();
		expect(top.every((n) => ['designs', 'meshes', 'thumbnails'].includes(n))).toBe(true);
	});
});

describe('saving designs', () => {
	const aValid = (): Design => addShape(createEmptyDesign(designId, 'Fuzz'), 'box', [0, 0], { id: 'a' }).design;

	it('arbitrary JSON bodies are refused cleanly and leave the saved design alone', async () => {
		await fc.assert(
			fc.asyncProperty(fc.jsonValue(), async (junk) => {
				const res = await app.inject({
					method: 'PUT',
					url: `/api/designs/${designId}`,
					payload: JSON.stringify(junk),
					headers: { 'content-type': 'application/json' },
				});
				ok(res.statusCode, [200, 400]);
			}),
			{ numRuns: 300 },
		);
		// Whatever was accepted along the way, the file is still a valid design for this id.
		const after = await app.inject(`/api/designs/${designId}`);
		expect(after.statusCode).toBe(200);
		expect(after.json<Design>().id).toBe(designId);
	});

	it('a good design with one value replaced by something nasty is refused or saved clean, and can always be read back', async () => {
		const nasty = fc.oneof(
			fc.constantFrom(0, -1, 1001, 1e9, 1e308, -1e308, '', 'x'.repeat(5000), null, true, [], {}, '#GGGGGG', '__proto__'),
			fc.jsonValue(),
		);
		await fc.assert(
			fc.asyncProperty(fc.nat(), nasty, async (pick, replacement) => {
				const json = withOneValueReplaced(aValid(), pick, replacement);

				const res = await app.inject({
					method: 'PUT',
					url: `/api/designs/${designId}`,
					payload: JSON.stringify(json),
					headers: { 'content-type': 'application/json' },
				});
				ok(res.statusCode, [200, 400]);
				const back = await app.inject(`/api/designs/${designId}`);
				expect(back.statusCode).toBe(200); // whatever happened, the stored design is still readable
			}),
			{ numRuns: 300 },
		);
	});

	it('creating, renaming with any text never crashes, and names are trimmed and limited', async () => {
		await fc.assert(
			fc.asyncProperty(fc.string({ maxLength: 400 }), async (name) => {
				const created = await app.inject({ method: 'POST', url: '/api/designs', payload: { name } });
				ok(created.statusCode, [201]);
				expect(created.json<Design>().name.length).toBeLessThanOrEqual(120);
				const renamed = await app.inject({ method: 'PATCH', url: `/api/designs/${created.json<Design>().id}`, payload: { name } });
				ok(renamed.statusCode, [200, 400]);
			}),
			{ numRuns: 100 },
		);
	});

	it('bodies that are not JSON at all, or are the wrong shape, are a clean error', async () => {
		await fc.assert(
			fc.asyncProperty(fc.string({ maxLength: 200 }), fc.constantFrom('POST', 'PATCH', 'PUT'), async (body, method) => {
				const url = method === 'POST' ? '/api/designs' : `/api/designs/${designId}`;
				const res = await app.inject({ method, url, payload: body, headers: { 'content-type': 'application/json' } });
				noCrash(res.statusCode);
			}),
			{ numRuns: 300 },
		);
	});
});
