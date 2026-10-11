import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let tmp: string;

beforeEach(async () => {
	tmp = await mkdtemp(path.join(os.tmpdir(), 'holecraft-server-'));
});

afterEach(async () => {
	await rm(tmp, { recursive: true, force: true });
});

async function withStatic() {
	const staticDir = path.join(tmp, 'web');
	await mkdir(staticDir);
	await writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>holecraft</title>');
	await writeFile(path.join(staticDir, 'app.js'), 'console.log(1)');
	return createServer({ dataDir: path.join(tmp, 'data'), staticDir, version: '9.9.9' });
}

describe('createServer', () => {
	it('creates the data directory', async () => {
		const app = await createServer({ dataDir: path.join(tmp, 'nested', 'data') });
		expect((await stat(path.join(tmp, 'nested', 'data'))).isDirectory()).toBe(true);
		await app.close();
	});

	it('reports health and version', async () => {
		const app = await withStatic();
		const res = await app.inject('/api/health');
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ status: 'ok', name: 'holecraft', version: '9.9.9' });
		await app.close();
	});

	it('serves static files and falls back to index.html for app routes', async () => {
		const app = await withStatic();
		const asset = await app.inject('/app.js');
		expect(asset.statusCode).toBe(200);
		expect(asset.body).toBe('console.log(1)');

		const route = await app.inject('/designs/abc');
		expect(route.statusCode).toBe(200);
		expect(route.body).toContain('<title>holecraft</title>');
		await app.close();
	});

	it('serves WebAssembly with its own content type, which browsers need to compile it quickly', async () => {
		const staticDir = path.join(tmp, 'web');
		const app = await withStatic();
		await writeFile(path.join(staticDir, 'manifold.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
		const res = await app.inject('/manifold.wasm');
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toContain('application/wasm');
		expect(res.rawPayload.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d])); // the wasm magic number
		await app.close();
	});

	it('serves ES module scripts (such as web workers) as JavaScript, not as the app shell', async () => {
		const staticDir = path.join(tmp, 'web');
		const app = await withStatic();
		await writeFile(path.join(staticDir, 'worker.js'), 'export {}');
		const res = await app.inject('/worker.js');
		expect(res.headers['content-type']).toMatch(/javascript/);
		expect(res.body).toBe('export {}');
		await app.close();
	});

	it('returns JSON 404 for unknown API routes', async () => {
		const app = await withStatic();
		const res = await app.inject('/api/nope');
		expect(res.statusCode).toBe(404);
		expect(res.json()).toEqual({ error: 'Not found' });
		await app.close();
	});
});
