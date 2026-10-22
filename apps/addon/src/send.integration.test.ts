import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '@holecraft/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendToHolecraft, testHolecraft } from './send.ts';
import { EMPTY_SETTINGS, type Settings } from './settings.ts';

/* The add-on against the real Holecraft server: what it sends is accepted, comes back unchanged, and the address it is told opens the file. */

let dir: string;
let app: Awaited<ReturnType<typeof createServer>>;
let settings: Settings;

beforeAll(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'holecraft-addon-'));
	app = await createServer({ dataDir: dir, version: '9.9.9' });
	await app.listen({ port: 0, host: '127.0.0.1' });
	settings = { ...EMPTY_SETTINGS, holecraftUrl: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
});

afterAll(async () => {
	await app.close();
	await rm(dir, { recursive: true, force: true });
});

describe('the add-on and the real Holecraft', () => {
	it('is found, and says its version', async () => {
		expect(await testHolecraft(settings)).toBe(`Holecraft 9.9.9 answered at ${settings.holecraftUrl}`);
	});

	it('sends a file the inbox accepts, keeps its name and bytes, and gets the address of the import screen', async () => {
		const bytes = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));
		const { openUrl } = await sendToHolecraft(settings, { name: 'Étagère (1).stl', bytes });
		const id = /\/import\/([0-9a-f]{32})$/.exec(openUrl)?.[1];
		expect(openUrl.startsWith(settings.holecraftUrl)).toBe(true);
		expect(id).toBeDefined();
		const back = await fetch(`${settings.holecraftUrl}/api/import/${id}`);
		expect(decodeURIComponent(back.headers.get('x-file-name') ?? '')).toBe('Étagère (1).stl');
		expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
	});

	it('gets a clear message when nothing is listening', async () => {
		await expect(
			sendToHolecraft({ ...settings, holecraftUrl: 'http://127.0.0.1:1' }, { name: 'a.stl', bytes: new Uint8Array([1]) }),
		).rejects.toThrow(/Could not reach Holecraft/);
	});
});
