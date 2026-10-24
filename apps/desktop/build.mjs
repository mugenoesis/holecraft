// Bundles the Electron main process together with the holecraft server so the
// packaged app ships without node_modules.
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: true, logLevel: 'info' };

await build({
	...common,
	entryPoints: ['src/main.ts'],
	outfile: 'dist/main.cjs',
	legalComments: 'linked',
	external: ['electron'],
	define: { __HOLECRAFT_VERSION__: JSON.stringify(pkg.version) },
});

// electron-builder's afterPack hook: it runs while packaging, so it is not part of the app (see "files" in package.json).
await build({ ...common, entryPoints: ['src/afterPack.ts'], outfile: 'dist/afterPack.cjs' });
