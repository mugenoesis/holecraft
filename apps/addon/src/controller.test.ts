import { deflateRawSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaughtFiles } from './caught.ts';
import { type ControllerDeps, createController } from './controller.ts';
import { RecentLog } from './recent.ts';
import { EMPTY_SETTINGS, type Settings } from './settings.ts';

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bytes = (s: string) => new TextEncoder().encode(s);

/** A zip of stored or deflated entries, built here apart from the code under test. */
function zipOf(entries: Record<string, string>): Uint8Array {
	const parts: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const [name, text] of Object.entries(entries)) {
		const data = Buffer.from(text);
		const packed = deflateRawSync(data);
		const n = Buffer.from(name);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(8, 8);
		local.writeUInt16LE(n.length, 26);
		const head = Buffer.alloc(46);
		head.writeUInt32LE(0x02014b50, 0);
		head.writeUInt16LE(8, 10);
		head.writeUInt32LE(packed.length, 20);
		head.writeUInt32LE(data.length, 24);
		head.writeUInt16LE(n.length, 28);
		head.writeUInt32LE(offset, 42);
		parts.push(local, n, packed);
		central.push(head, n);
		offset += 30 + n.length + packed.length;
	}
	const dir = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(entries).length, 8);
	end.writeUInt16LE(Object.keys(entries).length, 10);
	end.writeUInt32LE(dir.length, 12);
	end.writeUInt32LE(offset, 16);
	return new Uint8Array(Buffer.concat([...parts, dir, end]));
}

const settings: Settings = {
	holecraftUrl: 'http://hc:8200',
	tridentUrl: 'http://tr:8000',
	tridentKey: 'k',
	showBanner: true,
	showNotification: false,
	deleteAfterSend: false,
};
let files: CaughtFiles;
let stored: Settings;
let opened: string[];
let fetchFn: ReturnType<typeof vi.fn<ControllerDeps['fetchFn']>>;
let deps: ControllerDeps;
let changes: number;

const catchModel = (over: Record<string, unknown> = {}) =>
	files.add({
		name: 'Gear.stl',
		kind: 'model',
		size: 3,
		url: 'https://cdn.example.com/g',
		site: 'MakerWorld',
		bytes: bytes('stl'),
		...over,
	});
const catchZip = (entries: Record<string, string>, over: Record<string, unknown> = {}) =>
	files.add({
		name: 'Pack.zip',
		kind: 'zip',
		size: null,
		url: 'https://cdn.example.com/p',
		site: 'Printables',
		bytes: zipOf(entries),
		...over,
	});

beforeEach(() => {
	files = new CaughtFiles();
	stored = settings;
	opened = [];
	changes = 0;
	fetchFn = vi.fn<ControllerDeps['fetchFn']>();
	deps = {
		files,
		log: new RecentLog(),
		loadSettings: async () => stored,
		saveSettings: async (s) => {
			stored = s;
		},
		fetchFn,
		openTab: async (url) => {
			opened.push(url);
		},
		diagnose: () => ({ lines: [] }),
		onChange: () => {
			changes++;
		},
		maxBytes: 1000,
	};
});

const hcOk = () => json(201, { openUrl: `/import/${'a'.repeat(32)}` });

describe('state', () => {
	it('lists what was caught, and says which of Holecraft and Trident are set up', async () => {
		catchModel();
		const out = await createController(deps)({ type: 'state' });
		expect(out).toMatchObject({ ok: true, data: { holecraftReady: true, tridentReady: true } });
		expect((out as { data: { files: unknown[] } }).data.files).toHaveLength(1);
		stored = EMPTY_SETTINGS;
		expect(await createController(deps)({ type: 'state' })).toMatchObject({ data: { holecraftReady: false, tridentReady: false } });
	});
});

describe('send to Holecraft', () => {
	it('sends the bytes caught, opens the address it is given, and forgets the file', async () => {
		const id = catchModel();
		fetchFn.mockResolvedValue(hcOk());
		const out = await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(out).toEqual({ ok: true, data: null });
		const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://hc:8200/api/import');
		expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('stl');
		expect(opened).toEqual([`http://hc:8200/import/${'a'.repeat(32)}`]);
		expect(files.count()).toBe(0);
		expect(changes).toBe(1);
	});

	it('sends a zip whole, for Holecraft to ask which model', async () => {
		const id = catchZip({ 'a.stl': 'A', 'b.stl': 'B' });
		fetchFn.mockResolvedValue(hcOk());
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		const init = fetchFn.mock.calls[0]![1] as RequestInit;
		expect((init.headers as Record<string, string>)['x-file-name']).toBe('Pack.zip');
	});

	it('fetches the file again when its bytes were not copied, with the browser’s own login, then sends it', async () => {
		const id = catchModel({ bytes: null });
		fetchFn.mockImplementation(async (url: string) => (url === 'https://cdn.example.com/g' ? new Response(bytes('again')) : hcOk()));
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(fetchFn.mock.calls[0]).toEqual(['https://cdn.example.com/g', { credentials: 'include' }]);
		expect(new TextDecoder().decode((fetchFn.mock.calls[1]![1] as RequestInit).body as Uint8Array)).toBe('again');
	});

	it('says what to do when the file cannot be fetched again, and keeps it listed', async () => {
		const id = catchModel({ bytes: null });
		fetchFn.mockResolvedValue(new Response('no', { status: 403 }));
		const out = await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/download it again|could not be downloaded/i) });
		expect(files.count()).toBe(1);
		expect(opened).toEqual([]);
	});

	it('refuses a file that comes back bigger than it will carry', async () => {
		const id = catchModel({ bytes: null });
		fetchFn.mockResolvedValue(new Response(new Uint8Array(2000)));
		expect(await createController(deps)({ type: 'send', id, to: 'holecraft' })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/too large/i),
		});
	});

	it('gives the reason when sending fails, keeps the file, and opens nothing', async () => {
		const id = catchModel();
		fetchFn.mockRejectedValue(new Error('network'));
		const out = await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(out).toMatchObject({ ok: false, error: expect.stringContaining('Could not reach Holecraft at http://hc:8200') });
		expect(files.count()).toBe(1);
		expect(opened).toEqual([]);
	});

	it('says so when the file is gone (expired, or sent already)', async () => {
		expect(await createController(deps)({ type: 'send', id: 'nope', to: 'holecraft' })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/no longer/i),
		});
	});
});

describe('send to Trident', () => {
	const tridentOk = () => json(200, { model_id: 'm1' });

	it('uploads a model, and opens it in Trident', async () => {
		const id = catchModel();
		fetchFn.mockResolvedValue(tridentOk());
		expect(await createController(deps)({ type: 'send', id, to: 'trident' })).toEqual({ ok: true, data: null });
		expect(fetchFn.mock.calls[0]![0]).toBe('http://tr:8000/models');
		expect(opened).toEqual(['http://tr:8000/?model=m1']);
	});

	it('takes the one model out of a zip that has only one', async () => {
		const id = catchZip({ 'files/Part.stl': 'PART', 'readme.txt': 'hi' });
		fetchFn.mockResolvedValue(tridentOk());
		await createController(deps)({ type: 'send', id, to: 'trident' });
		const sent = (fetchFn.mock.calls[0]![1] as RequestInit).body as FormData;
		const file = sent.get('file') as File;
		expect(file.name).toBe('Part.stl');
		expect(await file.text()).toBe('PART');
	});

	it('takes the model asked for out of a zip with several', async () => {
		const id = catchZip({ 'a.stl': 'A', 'b/c.3mf': 'C' });
		fetchFn.mockResolvedValue(tridentOk());
		await createController(deps)({ type: 'send', id, to: 'trident', entry: 'b/c.3mf' });
		const file = ((fetchFn.mock.calls[0]![1] as RequestInit).body as FormData).get('file') as File;
		expect([file.name, await file.text()]).toEqual(['c.3mf', 'C']);
	});

	it('asks which, when a zip has several and none was chosen', async () => {
		const id = catchZip({ 'a.stl': 'A', 'b.stl': 'B' });
		expect(await createController(deps)({ type: 'send', id, to: 'trident' })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/which/i),
		});
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('refuses a name that is not in the zip', async () => {
		const id = catchZip({ 'a.stl': 'A' });
		expect(await createController(deps)({ type: 'send', id, to: 'trident', entry: '../../etc/passwd' })).toMatchObject({ ok: false });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('says so when a zip has nothing Trident can take', async () => {
		const id = catchZip({ 'pic.png': 'x' });
		expect(await createController(deps)({ type: 'send', id, to: 'trident' })).toMatchObject({
			ok: false,
			error: expect.stringMatching(/no model/i),
		});
	});
});

describe('zipModels', () => {
	it('lists the models in a caught zip that Trident can take', async () => {
		const id = catchZip({ 'b.stl': 'B', 'a.3mf': 'A', 'x.png': 'x' });
		expect(await createController(deps)({ type: 'zipModels', id })).toEqual({ ok: true, data: { models: ['a.3mf', 'b.stl'] } });
	});

	it('is an empty list for a file that is not a zip', async () => {
		const id = catchModel();
		expect(await createController(deps)({ type: 'zipModels', id })).toEqual({ ok: true, data: { models: [] } });
	});
});

describe('dismiss', () => {
	it('forgets a file', async () => {
		const id = catchModel();
		expect(await createController(deps)({ type: 'dismiss', id })).toEqual({ ok: true, data: null });
		expect(files.count()).toBe(0);
		expect(changes).toBe(1);
	});
});

describe('settings', () => {
	it('gives them back, and saves new ones tidied', async () => {
		const handle = createController(deps);
		expect(await handle({ type: 'getSettings' })).toEqual({ ok: true, data: settings });
		const saved = await handle({
			type: 'saveSettings',
			settings: {
				holecraftUrl: 'tower:8200/',
				tridentUrl: '',
				tridentKey: ' key ',
				showBanner: false,
				showNotification: true,
				deleteAfterSend: true,
			},
		});
		expect(saved).toEqual({
			ok: true,
			data: {
				holecraftUrl: 'http://tower:8200',
				tridentUrl: '',
				tridentKey: 'key',
				showBanner: false,
				showNotification: true,
				deleteAfterSend: true,
			},
		});
		expect(stored.holecraftUrl).toBe('http://tower:8200');
	});

	it('tests the connections with the saved settings, and gives the words either way', async () => {
		const handle = createController(deps);
		fetchFn.mockResolvedValueOnce(json(200, { name: 'holecraft', version: '1.2.3' }));
		expect(await handle({ type: 'test', target: 'holecraft' })).toEqual({ ok: true, data: 'Holecraft 1.2.3 answered at http://hc:8200' });
		fetchFn.mockRejectedValueOnce(new Error('x'));
		expect(await handle({ type: 'test', target: 'trident' })).toMatchObject({
			ok: false,
			error: expect.stringContaining('Could not reach Trident'),
		});
	});
});

describe('recent and diagnostics', () => {
	it('gives the log and can empty it', async () => {
		deps.log.add({ at: 1, site: 'S', url: 'u', status: 200, contentType: '', disposition: '', name: null, kind: null, note: 'n' });
		const handle = createController(deps);
		expect((await handle({ type: 'recent' })) as { data: unknown[] }).toMatchObject({ ok: true, data: [{ note: 'n' }] });
		await handle({ type: 'clearRecent' });
		expect(await handle({ type: 'recent' })).toEqual({ ok: true, data: [] });
	});

	it('gives what the browser can do', async () => {
		deps.diagnose = () => ({ lines: [{ label: 'webRequest', ok: true, detail: '' }] });
		expect(await createController(deps)({ type: 'diagnostics' })).toEqual({
			ok: true,
			data: { lines: [{ label: 'webRequest', ok: true, detail: '' }] },
		});
	});
});

describe('deleting the downloaded file after sending', () => {
	const deleting = vi.fn<NonNullable<ControllerDeps['deleteDownload']>>();
	beforeEach(() => {
		deleting.mockReset();
		deleting.mockResolvedValue('Deleted the downloaded file');
		deps.deleteDownload = deleting;
		stored = { ...settings, deleteAfterSend: true };
	});

	it('does it after a model was sent to Holecraft, when that is chosen, and says which file', async () => {
		const id = catchModel();
		fetchFn.mockResolvedValue(hcOk());
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(deleting).toHaveBeenCalledTimes(1);
		expect(deleting).toHaveBeenCalledWith(expect.objectContaining({ name: 'Gear.stl', url: 'https://cdn.example.com/g' }));
	});

	it('does it after a model was sent to Trident', async () => {
		const id = catchModel();
		fetchFn.mockResolvedValue(json(200, { model_id: 'm1' }));
		await createController(deps)({ type: 'send', id, to: 'trident' });
		expect(deleting).toHaveBeenCalledTimes(1);
	});

	it('does it after a zip was sent whole to Holecraft', async () => {
		const id = catchZip({ 'a.stl': 'A', 'b.stl': 'B' });
		fetchFn.mockResolvedValue(hcOk());
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(deleting).toHaveBeenCalledTimes(1);
	});

	it('does not do it when only one model was taken out of a zip for Trident: the rest of the zip would be lost', async () => {
		const id = catchZip({ 'a.stl': 'A', 'b.stl': 'B' });
		fetchFn.mockResolvedValue(json(200, { model_id: 'm1' }));
		await createController(deps)({ type: 'send', id, to: 'trident', entry: 'a.stl' });
		expect(deleting).not.toHaveBeenCalled();
	});

	it('does not do it unless it is chosen', async () => {
		stored = { ...settings, deleteAfterSend: false };
		const id = catchModel();
		fetchFn.mockResolvedValue(hcOk());
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(deleting).not.toHaveBeenCalled();
	});

	it('does not do it when the sending failed', async () => {
		const id = catchModel();
		fetchFn.mockRejectedValue(new Error('network'));
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(deleting).not.toHaveBeenCalled();
	});

	it('still counts the sending as done, and writes what happened in the log, when the file could not be deleted', async () => {
		deleting.mockRejectedValue(new Error('permission denied'));
		const id = catchModel();
		fetchFn.mockResolvedValue(hcOk());
		const out = await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(out).toEqual({ ok: true, data: null });
		expect(opened).toHaveLength(1);
		expect(deps.log.list()[0]?.note).toMatch(/could not delete.*permission denied/i);
	});

	it('writes what was done into the log, so it can be seen afterwards', async () => {
		const id = catchModel();
		fetchFn.mockResolvedValue(hcOk());
		await createController(deps)({ type: 'send', id, to: 'holecraft' });
		expect(deps.log.list()[0]?.note).toBe('Deleted the downloaded file');
		expect(deps.log.list()[0]?.name).toBe('Gear.stl');
	});

	it('does nothing when the browser has no way to delete (the Android one)', async () => {
		deps.deleteDownload = undefined;
		const id = catchModel();
		fetchFn.mockResolvedValue(hcOk());
		await expect(createController(deps)({ type: 'send', id, to: 'holecraft' })).resolves.toEqual({ ok: true, data: null });
	});
});
