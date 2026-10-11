import type { Design, DesignSummary } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-thumb-'));
  app = await createServer({ dataDir: dir });
});

afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

/** A real 1x1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const create = async (): Promise<Design> => (await app.inject({ method: 'POST', url: '/api/designs', payload: {} })).json<Design>();
const put = (id: string, payload: Buffer | string, type = 'image/png') =>
  app.inject({ method: 'PUT', url: `/api/designs/${id}/thumbnail`, payload: Buffer.from(payload), headers: { 'content-type': type } });
const list = async () => (await app.inject('/api/designs')).json<DesignSummary[]>();

/** A PNG header claiming the given size, for the size checks. */
function pngOfSize(width: number, height: number): Buffer {
  const copy = Buffer.from(PNG);
  copy.writeUInt32BE(width, 16);
  copy.writeUInt32BE(height, 20);
  return copy;
}

describe('PUT /api/designs/:id/thumbnail', () => {
  it('stores a picture for a design', async () => {
    const d = await create();
    expect((await put(d.id, PNG)).statusCode).toBe(204);
    const res = await app.inject(`/api/designs/${d.id}/thumbnail`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(new Uint8Array(res.rawPayload)).toEqual(new Uint8Array(PNG));
  });

  it('replaces the previous picture', async () => {
    const d = await create();
    await put(d.id, PNG);
    await put(d.id, pngOfSize(2, 2));
    const res = await app.inject(`/api/designs/${d.id}/thumbnail`);
    expect(res.rawPayload.readUInt32BE(16)).toBe(2);
  });

  it('is a 404 for a design that does not exist, and stores nothing', async () => {
    expect((await put('0'.repeat(32), PNG)).statusCode).toBe(404);
    expect(await readdir(path.join(dir, 'thumbnails')).catch(() => [])).toEqual([]);
  });

  it('refuses bytes that are not a PNG', async () => {
    const d = await create();
    const res = await put(d.id, 'GIF89a not a png at all, just some words to fill it up');
    expect(res.statusCode).toBe(400);
    expect((await app.inject(`/api/designs/${d.id}/thumbnail`)).statusCode).toBe(404);
  });

  it('refuses a PNG that is cut short', async () => {
    const d = await create();
    expect((await put(d.id, PNG.subarray(0, PNG.length - 12))).statusCode).toBe(400);
  });

  it('refuses a picture bigger than a thumbnail should be', async () => {
    const d = await create();
    expect((await put(d.id, pngOfSize(5000, 10))).statusCode).toBe(400);
    expect((await put(d.id, pngOfSize(0, 10))).statusCode).toBe(400);
  });

  it('refuses a body that is far too large', async () => {
    const d = await create();
    const res = await put(d.id, Buffer.concat([PNG, Buffer.alloc(400 * 1024)]));
    expect(res.statusCode).toBe(413);
  });

  it('refuses other content types', async () => {
    const d = await create();
    const res = await put(d.id, PNG, 'text/plain');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('never writes outside the thumbnails folder', async () => {
    const res = await put('..%2F..%2Fescape', PNG);
    expect([400, 404]).toContain(res.statusCode);
  });
});

describe('GET /api/designs/:id/thumbnail', () => {
  it('is a 404 until a picture has been stored', async () => {
    const d = await create();
    expect((await app.inject(`/api/designs/${d.id}/thumbnail`)).statusCode).toBe(404);
  });

  it('is a 404 for a bad id', async () => {
    expect((await app.inject('/api/designs/not-an-id/thumbnail')).statusCode).toBe(404);
  });

  it('is served so that the browser will not guess it is something else', async () => {
    const d = await create();
    await put(d.id, PNG);
    const res = await app.inject(`/api/designs/${d.id}/thumbnail`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('thumbnails in the designs list', () => {
  it('shows when each picture was made, only for designs that have one', async () => {
    const a = await create();
    const b = await create();
    await put(a.id, PNG);
    const items = await list();
    const withPicture = items.find((i) => i.id === a.id)!;
    expect(withPicture.thumbnailAt).toEqual(expect.any(Number));
    expect(items.find((i) => i.id === b.id)!.thumbnailAt).toBeUndefined();
  });

  it('changes when the picture is replaced, so browsers fetch the new one', async () => {
    const d = await create();
    await put(d.id, PNG);
    const first = (await list())[0]!.thumbnailAt!;
    await new Promise((r) => setTimeout(r, 20));
    await put(d.id, PNG);
    expect((await list())[0]!.thumbnailAt!).toBeGreaterThan(first);
  });
});

describe('thumbnails when designs are duplicated or deleted', () => {
  it('gives a duplicate the same picture to start with', async () => {
    const d = await create();
    await put(d.id, PNG);
    const copy = (await app.inject({ method: 'POST', url: `/api/designs/${d.id}/duplicate` })).json<Design>();
    const res = await app.inject(`/api/designs/${copy.id}/thumbnail`);
    expect(res.statusCode).toBe(200);
    expect(new Uint8Array(res.rawPayload)).toEqual(new Uint8Array(PNG));
  });

  it('duplicating a design with no picture still works', async () => {
    const d = await create();
    expect((await app.inject({ method: 'POST', url: `/api/designs/${d.id}/duplicate` })).statusCode).toBe(201);
  });

  it('removes the picture when the design is deleted', async () => {
    const d = await create();
    await put(d.id, PNG);
    await app.inject({ method: 'DELETE', url: `/api/designs/${d.id}` });
    expect(await readdir(path.join(dir, 'thumbnails'))).toEqual([]);
  });
});
