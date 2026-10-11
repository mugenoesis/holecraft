import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { MAX_DESIGN_BYTES, registerDesignRoutes } from './designRoutes.ts';
import { DesignStore } from './designs.ts';
import { MeshStore, registerMeshRoutes } from './meshes.ts';

export interface ServerOptions {
  /** Where designs, thumbnails and imported meshes are stored. Created if missing. */
  dataDir: string;
  /** Built web app (apps/web/dist). Omit to serve only the API. */
  staticDir?: string;
  version?: string;
  logger?: boolean;
}

/**
 * Builds the holecraft server without listening, so the Docker entrypoint and the
 * Electron main process can share it (and tests can use `inject`).
 */
export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  await mkdir(opts.dataDir, { recursive: true });

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: MAX_DESIGN_BYTES });
  const version = opts.version ?? 'dev';

  app.get('/api/health', async () => ({ status: 'ok', name: 'holecraft', version }));
  registerDesignRoutes(app, new DesignStore(opts.dataDir));
  const meshes = new MeshStore(opts.dataDir);
  await meshes.init();
  registerMeshRoutes(app, meshes);

  const staticDir = opts.staticDir;
  if (staticDir) {
    await app.register(fastifyStatic, { root: path.resolve(staticDir) });
  }

  // Unknown GET routes fall back to the SPA shell; unknown API routes stay JSON 404s.
  app.setNotFoundHandler((req, reply) => {
    if (staticDir && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
