import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.ts';

declare const __HOLECRAFT_VERSION__: string | undefined;

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const port = Number(env.HOLECRAFT_PORT ?? 8080);
const host = env.HOLECRAFT_HOST ?? '0.0.0.0';
const dataDir = path.resolve(env.HOLECRAFT_DATA_DIR ?? 'data');
// Works from both src/ (tsx) and dist/ (bundle): apps/server/<dir>/../../web/dist
const staticDir = path.resolve(env.HOLECRAFT_STATIC_DIR ?? path.join(here, '../../web/dist'));
const auth = env.HOLECRAFT_AUTH ?? 'none';

if (auth !== 'none') {
  console.error(`HOLECRAFT_AUTH=${auth} is not supported yet; only "none" is available.`);
  process.exit(1);
}

const app = await createServer({
  dataDir,
  staticDir: existsSync(staticDir) ? staticDir : undefined,
  version: typeof __HOLECRAFT_VERSION__ === 'string' ? __HOLECRAFT_VERSION__ : 'dev',
  logger: true,
});

if (!existsSync(staticDir)) {
  app.log.warn(`Web app not found at ${staticDir}; serving the API only. Run "npm run build" first.`);
}
app.log.info(`Data directory: ${dataDir}`);

await app.listen({ port, host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
