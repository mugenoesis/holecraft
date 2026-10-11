// Bundles the server (and its dependencies) into a single file so the Docker
// image and the desktop app need no node_modules at runtime.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  legalComments: 'linked',
  define: { __EZCAD_VERSION__: JSON.stringify(pkg.version) },
  // Fastify's dependencies are CommonJS and call require() on node builtins.
  banner: { js: "import { createRequire as __ezcadCreateRequire } from 'node:module'; const require = __ezcadCreateRequire(import.meta.url);" },
  logLevel: 'info',
});
