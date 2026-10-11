import { encodeMesh, type MeshData } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-mesh-'));
  app = await createServer({ dataDir: dir });
});

afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

const tetra = (): MeshData => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
});

const upload = (payload: Uint8Array | string, contentType = 'application/octet-stream') =>
  app.inject({ method: 'POST', url: '/api/meshes', payload: Buffer.from(payload), headers: { 'content-type': contentType } });

describe('POST /api/meshes', () => {
  it('stores a mesh and answers with its reference, the SHA-256 of its bytes', async () => {
    const bytes = encodeMesh(tetra());
    const res = await upload(bytes);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ ref: createHash('sha256').update(bytes).digest('hex') });
  });

  it('keeps one copy when the same mesh is uploaded twice', async () => {
    const bytes = encodeMesh(tetra());
    const a = (await upload(bytes)).json<{ ref: string }>();
    const b = (await upload(bytes)).json<{ ref: string }>();
    expect(a.ref).toBe(b.ref);
    expect(await readdir(path.join(dir, 'meshes'))).toEqual([`${a.ref}.mesh`]);
  });

  it('refuses bytes that are not a valid mesh, and stores nothing', async () => {
    const res = await upload('definitely not a mesh');
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/mesh/i);
    await expect(readdir(path.join(dir, 'meshes'))).resolves.toEqual([]);
  });

  it('refuses a mesh whose triangles point outside it', async () => {
    const bad = tetra();
    bad.indices[0] = 50;
    expect((await upload(encodeMesh(bad))).statusCode).toBe(400);
  });

  it('refuses other content types', async () => {
    const res = await upload(encodeMesh(tetra()), 'text/plain');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('leaves no temporary files behind', async () => {
    await upload(encodeMesh(tetra()));
    const files = await readdir(path.join(dir, 'meshes'));
    expect(files.every((f) => f.endsWith('.mesh'))).toBe(true);
  });
});

describe('GET /api/meshes/:ref', () => {
  it('returns the bytes that were stored', async () => {
    const bytes = encodeMesh(tetra());
    const { ref } = (await upload(bytes)).json<{ ref: string }>();
    const res = await app.inject(`/api/meshes/${ref}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(new Uint8Array(res.rawPayload)).toEqual(bytes);
  });

  it('can be cached for good, since a reference never changes meaning', async () => {
    const { ref } = (await upload(encodeMesh(tetra()))).json<{ ref: string }>();
    const res = await app.inject(`/api/meshes/${ref}`);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('is a 404 for a mesh that is not there', async () => {
    expect((await app.inject(`/api/meshes/${'0'.repeat(64)}`)).statusCode).toBe(404);
  });

  it('never reads outside the meshes folder', async () => {
    for (const bad of ['..%2F..%2Fdesigns%2Fx', 'A'.repeat(64), 'abc', '%2e%2e%2f%2e%2e%2fetc%2fpasswd']) {
      const res = await app.inject(`/api/meshes/${bad}`);
      expect([400, 404]).toContain(res.statusCode);
    }
  });
});
