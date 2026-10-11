// Bundles the Electron main process together with the ezcad server so the
// packaged app ships without node_modules.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  legalComments: 'linked',
  external: ['electron'],
  define: { __EZCAD_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});
