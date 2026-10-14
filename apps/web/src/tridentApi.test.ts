import { addPaletteColor, addShape, createEmptyDesign, type Design, renameDesign } from '@holecraft/core';
import { type ExportBody, readStoredZip } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { exportOrcaBytes } from './exportDesign.ts';
import { defaultTridentAddress, forgetTrident, getTrident, hostLabel, saveTrident, sendToTrident } from './tridentApi.ts';

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const callOf = (f: ReturnType<typeof vi.fn>) => {
	const [url, init] = f.mock.calls[0] as [string, RequestInit];
	return { url, init };
};

describe('the Trident settings, as the page asks for them', () => {
	it('reads what the server knows (never the key)', async () => {
		const f = reply(200, { url: 'http://t.lan:8000', hasKey: true });
		expect(await getTrident(f)).toEqual({ url: 'http://t.lan:8000', hasKey: true });
		expect(callOf(f).url).toBe('/api/trident');
	});

	it('saves the address and a typed key, and leaves the key out when nothing was typed', async () => {
		const f = reply(200, { url: 'http://t.lan:8000', hasKey: true });
		await saveTrident({ url: 'http://t.lan:8000', key: 'trident_x' }, f);
		expect(callOf(f).init.method).toBe('PUT');
		expect(JSON.parse(String(callOf(f).init.body))).toEqual({ url: 'http://t.lan:8000', key: 'trident_x' });
		const g = reply(200, { url: 'http://t.lan:8000', hasKey: true });
		await saveTrident({ url: 'http://t.lan:8000', key: '' }, g);
		expect(JSON.parse(String(callOf(g).init.body))).toEqual({ url: 'http://t.lan:8000' }); // empty = keep the saved one
	});

	it('forgets them', async () => {
		const f = reply(200, { url: null, hasKey: false });
		expect(await forgetTrident(f)).toEqual({ url: null, hasKey: false });
		expect(callOf(f).init.method).toBe('DELETE');
	});

	it('throws the server’s own message when it refuses', async () => {
		await expect(saveTrident({ url: 'x', key: '' }, reply(400, { error: 'That is not a usable Trident address' }))).rejects.toThrow(
			/usable Trident address/,
		);
	});
});

describe('sending a model', () => {
	const file = { fileName: 'Cube.3mf', data: new Uint8Array([80, 75, 3, 4]) };

	it('posts the bytes as a 3MF, named, and answers with the address to open', async () => {
		const f = reply(200, { openUrl: 'http://t.lan:8000/?model=abc' });
		expect(await sendToTrident(file, f)).toEqual({ openUrl: 'http://t.lan:8000/?model=abc' });
		const { url, init } = callOf(f);
		expect(url).toBe('/api/trident/send');
		expect(init.method).toBe('POST');
		const headers = init.headers as Record<string, string>;
		expect(headers['content-type']).toBe('model/3mf');
		expect(decodeURIComponent(headers['x-file-name']!)).toBe('Cube.3mf');
		expect(init.body).toBe(file.data);
	});

	it('sends a name with odd characters in a form a header can carry', async () => {
		const f = reply(200, { openUrl: 'u' });
		await sendToTrident({ ...file, fileName: 'Brücke ✓.3mf' }, f);
		const name = (callOf(f).init.headers as Record<string, string>)['x-file-name']!;
		expect(name).toMatch(/^[\x20-\x7e]+$/);
		expect(decodeURIComponent(name)).toBe('Brücke ✓.3mf');
	});

	it('throws what Trident or the server said went wrong', async () => {
		await expect(sendToTrident(file, reply(502, { error: 'Could not reach Trident at http://t.lan:8000.' }))).rejects.toThrow(
			/reach Trident/,
		);
		await expect(sendToTrident(file, reply(409, { error: 'Trident is not set up yet' }))).rejects.toThrow(/not set up/);
	});

	it('says something useful when the answer is not even JSON', async () => {
		const f = vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
		await expect(sendToTrident(file, f)).rejects.toThrow(/502/);
	});

	it('says it could not reach Holecraft’s own server when the request itself fails', async () => {
		await expect(sendToTrident(file, vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))).rejects.toThrow(/Holecraft/);
	});
});

describe('wording the address', () => {
	it('shows the host and port without the scheme', () => {
		expect(hostLabel('http://192.168.1.3:8000')).toBe('192.168.1.3:8000');
		expect(hostLabel('https://slicer.example.lan/trident')).toBe('slicer.example.lan/trident');
	});

	it('guesses the address from where Holecraft is open: the same machine, Trident’s usual port', () => {
		expect(defaultTridentAddress({ protocol: 'http:', hostname: '192.168.1.3' })).toBe('http://192.168.1.3:8000');
		expect(defaultTridentAddress({ protocol: 'https:', hostname: 'holecraft.lan' })).toBe('https://holecraft.lan:8000');
	});
});

describe('the file that is sent', () => {
	const body = (): ExportBody => ({
		name: 'Box 1',
		color: '#f28c28',
		mesh: {
			positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
			indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
		},
	});
	const design = (): Design => {
		let d = renameDesign(createEmptyDesign('d', 'x'), 'Colour test');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		return addPaletteColor(d, '#112233');
	};

	it('is the same file as "3MF for OrcaSlicer", with its name, kept in memory instead of downloaded', async () => {
		const bodies = vi.fn().mockResolvedValue([body()]);
		const save = vi.fn();
		const out = await exportOrcaBytes(design(), { bodies, save });
		expect(save).not.toHaveBeenCalled();
		expect(out.fileName).toBe('Colour test.3mf');
		const zip = readStoredZip(out.data);
		expect([...zip.keys()]).toContain('Metadata/project_settings.config');
		expect(JSON.parse(new TextDecoder().decode(zip.get('Metadata/project_settings.config'))).filament_colour).toHaveLength(5);
	});

	it('says there is nothing to send when there are no solid shapes', async () => {
		await expect(exportOrcaBytes(design(), { bodies: vi.fn().mockResolvedValue([]), save: vi.fn() })).rejects.toThrow(/Nothing to export/);
	});
});
