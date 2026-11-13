// Builds a model written in code, measures the real geometry, and (unless --dry) saves it as a design on a running Holecraft.
// Run through scripts/model.sh, which sets up tsx; see that file for usage.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Design, ModelBuilder } from '@holecraft/core';
import { type BodyReport, buildModel, loadManifold, writeStl } from '@holecraft/geometry';

const API = process.env.HOLECRAFT_API ?? 'http://127.0.0.1:8200';
// the address put in printed links: the one a phone or browser opens, which may differ from the one this script talks to
const PUBLIC_URL = (process.env.HOLECRAFT_PUBLIC_URL ?? API).replace(/\/$/, '');
// a variable, not a literal, so knip does not take the shell script for a module
const ROOT = resolve(import.meta.dirname, '..', '..');
const SHOT_SCRIPT = resolve(ROOT, 'scripts', 'screenshot.sh');
const VIEWS = ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom'];

const slug = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'model';

const fmt = (v: readonly number[]): string => v.map((n) => Number(n.toFixed(2))).join(' x ');

function describe(r: BodyReport): string {
	const lines = [
		`  ${r.name}: ${fmt(r.size)} mm, ${Math.round(r.volume)} mm3 (${(r.volume / 1000).toFixed(2)} cm3), ${r.triangles} triangles`,
	];
	lines.push(`    from (${fmt(r.min)}) to (${fmt(r.max)}), ${r.closed ? 'closed surface' : `NOT CLOSED: ${r.problems.join('; ')}`}`);
	return lines.join('\n');
}

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: body === undefined ? {} : { 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const text = await res.text();
	const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${String(json.error ?? text)}`);
	return json;
}

/** Saves the design: a new one, or over `existing` (earlier versions are kept by the server's history). Returns its id. */
async function save(design: Design, existing: string | undefined): Promise<string> {
	const id = existing ?? String((await call('POST', '/api/designs', { name: design.name })).id);
	await call('PUT', `/api/designs/${id}`, { ...design, id });
	return id;
}

/** Takes the picture in Docker, which only sees the repo, so the path goes in relative to it. Says so if the file did not appear. */
function screenshot(id: string, out: string, view: string): void {
	const inRepo = relative(ROOT, out);
	if (inRepo.startsWith('..')) {
		console.log(`Screenshot skipped: --out must be inside the repo (${ROOT}) so the Docker container can write it`);
		return;
	}
	const env = { ...process.env, VIEW: view, WAIT: '6000' };
	const run = spawnSync(SHOT_SCRIPT, [`${API}/design/${id}`, inRepo, '1000', '700'], {
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
	});
	if (run.status !== 0) {
		console.log(`Screenshot failed (the design is saved): ${(run.stderr || run.stdout).trim().split('\n').slice(-3).join(' | ')}`);
	} else if (!existsSync(out)) {
		console.log(`Screenshot reported success but ${out} does not exist (the design is saved)`);
	} else {
		console.log(`Screenshot: ${out}`);
	}
}

async function main(): Promise<number> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			dry: { type: 'boolean', default: false },
			shot: { type: 'boolean', default: false },
			view: { type: 'string', default: 'iso' },
			id: { type: 'string' },
			out: { type: 'string', default: 'models/out' },
		},
	});
	const [command, file] = positionals;
	if (command !== 'build' || !file) {
		console.error('Usage: scripts/model.sh build <model.ts> [--dry] [--id <design id>] [--shot] [--view iso|top|front|...] [--out <dir>]');
		return 2;
	}
	if (!VIEWS.includes(values.view)) {
		console.error(`--view must be one of ${VIEWS.join(', ')}`);
		return 2;
	}

	const spec = (await import(pathToFileURL(resolve(file)).href)) as { default?: (m: ModelBuilder) => void | Promise<void>; name?: string };
	if (typeof spec.default !== 'function') {
		console.error(`${file} must export a default function that takes a ModelBuilder (see models/README.md)`);
		return 2;
	}
	const name = spec.name ?? basename(file).replace(/\.[^.]+$/, '');
	const built = await buildModel(await loadManifold(), name, spec.default);

	mkdirSync(values.out, { recursive: true });
	const stl = resolve(values.out, `${slug(name)}.stl`);
	writeFileSync(stl, writeStl(built.bodies));

	console.log(`Model "${name}": ${built.reports.length} body(ies)`);
	for (const r of built.reports) console.log(describe(r));
	for (const w of built.warnings) console.log(`WARNING: ${w}`);
	console.log(`STL: ${stl}`);
	if (values.dry) {
		console.log('Dry run: nothing saved.');
		return built.warnings.length ? 1 : 0;
	}

	const id = await save(built.design, values.id);
	console.log(`Design: ${PUBLIC_URL}/design/${id}`);
	console.log(`Design id: ${id}`);
	if (values.shot) {
		const png = resolve(values.out, `${slug(name)}-${values.view}.png`);
		screenshot(id, png, values.view);
		console.log(`Picture (the same design's thumbnail, once the editor has drawn it): ${PUBLIC_URL}/api/designs/${id}/thumbnail`);
	}
	return built.warnings.length ? 1 : 0;
}

main().then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(2);
	},
);
