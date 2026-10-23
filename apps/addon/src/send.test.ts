import { describe, expect, it, vi } from 'vitest';
import { IMPORT_CONTENT_TYPE, SendError, sendToHolecraft, sendToTrident, testHolecraft, testTrident } from './send.ts';
import type { Settings } from './settings.ts';

const settings: Settings = {
	holecraftUrl: 'http://tower:8200',
	tridentUrl: 'http://tower:8000',
	tridentKey: 'secret',
	showBanner: true,
	showNotification: false,
	deleteAfterSend: false,
};
const file = { name: 'Étagère (1).stl', bytes: new Uint8Array([1, 2, 3]) };
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('sendToHolecraft', () => {
	it('posts the file as the inbox expects it, and gives the address to open', async () => {
		const fetchFn = vi.fn().mockResolvedValue(json(201, { id: 'a'.repeat(32), name: 'x', size: 3, openUrl: `/import/${'a'.repeat(32)}` }));
		const out = await sendToHolecraft(settings, file, fetchFn);
		expect(out.openUrl).toBe(`http://tower:8200/import/${'a'.repeat(32)}`);
		const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://tower:8200/api/import');
		expect(init.method).toBe('POST');
		expect(init.headers).toEqual({
			'content-type': IMPORT_CONTENT_TYPE,
			'x-holecraft-import': '1',
			'x-file-name': encodeURIComponent('Étagère (1).stl'),
		});
		expect([...(init.body as Uint8Array)]).toEqual([1, 2, 3]);
		expect(init.redirect).toBe('manual');
	});

	it('says to set it up first when there is no address', async () => {
		await expect(sendToHolecraft({ ...settings, holecraftUrl: '' }, file, vi.fn())).rejects.toThrow(/not set up/i);
	});

	it('says when it cannot reach the server, with the address', async () => {
		await expect(sendToHolecraft(settings, file, vi.fn().mockRejectedValue(new TypeError('network')))).rejects.toThrow(
			/Could not reach Holecraft at http:\/\/tower:8200/,
		);
	});

	it('says what went wrong for the answers it knows', async () => {
		const withStatus = (status: number) => sendToHolecraft(settings, file, vi.fn().mockResolvedValue(json(status, { error: 'x' })));
		await expect(withStatus(403)).rejects.toThrow(/refused/i);
		await expect(withStatus(413)).rejects.toThrow(/too large.*200 MB/i);
		await expect(withStatus(404)).rejects.toThrow(/older version|not a Holecraft|address/i);
		await expect(withStatus(500)).rejects.toThrow(/500/);
	});

	it('says so when the answer is not what Holecraft sends', async () => {
		await expect(sendToHolecraft(settings, file, vi.fn().mockResolvedValue(json(201, { nope: 1 })))).rejects.toThrow(/unexpected/i);
		await expect(sendToHolecraft(settings, file, vi.fn().mockResolvedValue(new Response('<html>', { status: 201 })))).rejects.toThrow(
			/unexpected/i,
		);
	});

	it('does not follow an address on another site, whatever the server says', async () => {
		const evil = vi.fn().mockResolvedValue(json(201, { openUrl: 'https://evil.example/import/x' }));
		await expect(sendToHolecraft(settings, file, evil)).rejects.toThrow(/unexpected/i);
		const sneaky = vi.fn().mockResolvedValue(json(201, { openUrl: '//evil.example/import/x' }));
		await expect(sendToHolecraft(settings, file, sneaky)).rejects.toThrow(/unexpected/i);
	});

	it('errors are SendErrors', async () => {
		await expect(sendToHolecraft(settings, file, vi.fn().mockRejectedValue(new Error('x')))).rejects.toBeInstanceOf(SendError);
	});
});

describe('sendToTrident', () => {
	it('uploads the file with the key, and gives the address to open the model', async () => {
		const fetchFn = vi.fn().mockResolvedValue(json(200, { model_id: 'abc 123' }));
		const out = await sendToTrident(settings, file, fetchFn);
		expect(out.openUrl).toBe('http://tower:8000/?model=abc%20123');
		const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://tower:8000/models');
		expect(init.method).toBe('POST');
		expect(init.headers).toEqual({ authorization: 'Bearer secret' });
		expect(init.redirect).toBe('manual');
		const form = init.body as FormData;
		const sent = form.get('file') as File;
		expect(sent.name).toBe('Étagère (1).stl');
		expect([...new Uint8Array(await sent.arrayBuffer())]).toEqual([1, 2, 3]);
	});

	it('sends no key when there is none', async () => {
		const fetchFn = vi.fn().mockResolvedValue(json(200, { model_id: 'x' }));
		await sendToTrident({ ...settings, tridentKey: '' }, file, fetchFn);
		expect((fetchFn.mock.calls[0] as [string, RequestInit])[1].headers).toEqual({});
	});

	it('says to set it up first when there is no address', async () => {
		await expect(sendToTrident({ ...settings, tridentUrl: '' }, file, vi.fn())).rejects.toThrow(/not set up/i);
	});

	it('says what to do for the answers it knows', async () => {
		const withStatus = (status: number) => sendToTrident(settings, file, vi.fn().mockResolvedValue(json(status, {})));
		await expect(withStatus(401)).rejects.toThrow(/API key/i);
		await expect(withStatus(403)).rejects.toThrow(/not allowed|permission|scope/i);
		await expect(withStatus(413)).rejects.toThrow(/too large/i);
		await expect(withStatus(415)).rejects.toThrow(/type|read/i);
		await expect(withStatus(500)).rejects.toThrow(/500/);
	});

	it('says when it cannot reach Trident, and when the answer is not one', async () => {
		await expect(sendToTrident(settings, file, vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow(
			/Could not reach Trident at http:\/\/tower:8000/,
		);
		await expect(sendToTrident(settings, file, vi.fn().mockResolvedValue(json(200, { no: 1 })))).rejects.toThrow(/unexpected|Trident/i);
	});
});

describe('testHolecraft and testTrident', () => {
	it('say what they found', async () => {
		const found = vi.fn().mockResolvedValue(json(200, { status: 'ok', name: 'holecraft', version: '0.5.0' }));
		expect(await testHolecraft(settings, found)).toBe('Holecraft 0.5.0 answered at http://tower:8200');
		expect((found.mock.calls[0] as [string])[0]).toBe('http://tower:8200/api/health');
		const trident = vi.fn().mockResolvedValue(json(200, { ok: true }));
		expect(await testTrident(settings, trident)).toBe('Trident answered at http://tower:8000');
		expect((trident.mock.calls[0] as [string])[0]).toBe('http://tower:8000/healthz');
	});

	it('say when it is not set up, cannot be reached, or is something else', async () => {
		await expect(testHolecraft({ ...settings, holecraftUrl: '' }, vi.fn())).rejects.toThrow(/not set up/i);
		await expect(testHolecraft(settings, vi.fn().mockRejectedValue(new Error('x')))).rejects.toThrow(/Could not reach/);
		await expect(testHolecraft(settings, vi.fn().mockResolvedValue(json(200, { name: 'other' })))).rejects.toThrow(
			/does not look like Holecraft/,
		);
		await expect(testTrident(settings, vi.fn().mockResolvedValue(json(404, {})))).rejects.toThrow(/Trident/);
	});
});
