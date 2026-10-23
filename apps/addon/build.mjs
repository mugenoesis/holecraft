// Builds the Firefox add-on into dist/ (the files the browser loads) and packs them into release/holecraft-send-<version>.zip, the file to
// upload to addons.mozilla.org to have it signed (or to load for a moment from about:debugging). Run by scripts/package-addon.sh.
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const here = import.meta.dirname;
const pkg = JSON.parse(await readFile(path.join(here, 'package.json'), 'utf8'));
const dist = path.join(here, 'dist');
const release = path.join(here, 'release');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
	entryPoints: { background: 'src/background.ts', popup: 'src/popup.ts', options: 'src/options.ts', toast: 'src/toast.ts' },
	outdir: dist,
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'firefox128',
	sourcemap: false,
	minify: false,
	legalComments: 'none',
	logLevel: 'info',
});

for (const file of ['popup.html', 'options.html', 'addon.css']) await copyFile(path.join(here, 'static', file), path.join(dist, file));
await copyFile(path.join(here, '../web/public/icon-192.png'), path.join(dist, 'icon.png'));
const manifest = JSON.parse(await readFile(path.join(here, 'static/manifest.json'), 'utf8'));
manifest.version = pkg.version;
await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`);

// --- the zip: stored entries, which any zip reader (and addons.mozilla.org) takes ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
const crc32 = (data) => {
	let c = 0xffffffff;
	for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
const names = [
	'manifest.json',
	'background.js',
	'popup.js',
	'popup.html',
	'options.js',
	'options.html',
	'toast.js',
	'addon.css',
	'icon.png',
];
const locals = [];
const centrals = [];
let offset = 0;
for (const name of names) {
	const data = await readFile(path.join(dist, name));
	const nameBytes = Buffer.from(name);
	const crc = crc32(data);
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(0x0800, 6); // UTF-8 names
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(data.length, 18);
	local.writeUInt32LE(data.length, 22);
	local.writeUInt16LE(nameBytes.length, 26);
	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(0x0800, 8);
	central.writeUInt32LE(crc, 16);
	central.writeUInt32LE(data.length, 20);
	central.writeUInt32LE(data.length, 24);
	central.writeUInt16LE(nameBytes.length, 28);
	central.writeUInt32LE(offset, 42);
	locals.push(local, nameBytes, data);
	centrals.push(central, nameBytes);
	offset += 30 + nameBytes.length + data.length;
}
const directory = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await mkdir(release, { recursive: true });
const zip = path.join(release, `holecraft-send-${pkg.version}.zip`);
await writeFile(zip, Buffer.concat([...locals, directory, end]));
console.log(`Wrote ${path.relative(process.cwd(), zip)}`);
