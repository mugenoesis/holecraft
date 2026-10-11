import { decodeMesh, isMeshRef } from '@holecraft/core';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Largest stored mesh accepted: about a million triangles with room to spare. */
export const MAX_MESH_BYTES = 64 * 1024 * 1024;

/**
 * Imported models, stored once each under the SHA-256 of their bytes. The reference is the only
 * thing that becomes part of a file name, and `isMeshRef` guards every access to disk.
 */
export class MeshStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'meshes');
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  /** Checks and stores a mesh; throws if the bytes are not a valid one. Returns its reference. */
  async put(bytes: Uint8Array): Promise<string> {
    decodeMesh(bytes); // throws when it is not exactly a valid mesh
    const ref = createHash('sha256').update(bytes).digest('hex');
    const file = this.fileFor(ref);
    if (await exists(file)) return ref;

    // Write beside the final name and rename, so a half-written file is never read.
    const temp = path.join(this.dir, `.${ref}.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(temp, bytes);
    await rename(temp, file);
    return ref;
  }

  async get(ref: string): Promise<Buffer | null> {
    if (!isMeshRef(ref)) return null;
    try {
      return await readFile(this.fileFor(ref));
    } catch {
      return null;
    }
  }

  private fileFor(ref: string): string {
    return path.join(this.dir, `${ref}.mesh`);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Upload (`POST /api/meshes`, raw bytes) and download (`GET /api/meshes/:ref`) of imported models. */
export function registerMeshRoutes(app: FastifyInstance, store: MeshStore): void {
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_MESH_BYTES }, (_request, body, done) => done(null, body));

  app.post('/api/meshes', { bodyLimit: MAX_MESH_BYTES }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'Send the model as application/octet-stream' });
    try {
      return reply.code(201).send({ ref: await store.put(request.body) });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'That is not a valid model' });
    }
  });

  app.get<{ Params: { ref: string } }>('/api/meshes/:ref', async (request, reply) => {
    const bytes = await store.get(request.params.ref);
    if (!bytes) return reply.code(404).send({ error: 'Model not found' });
    // The reference is the hash of the bytes, so what it names can never change.
    return reply.header('content-type', 'application/octet-stream').header('cache-control', 'public, max-age=31536000, immutable').send(bytes);
  });
}
