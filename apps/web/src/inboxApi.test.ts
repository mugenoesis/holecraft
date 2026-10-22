import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteInboxFile, fetchInboxFile } from './inboxApi.ts';

const id = '0123456789abcdef0123456789abcdef';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchInboxFile', () => {
	it('gives the waiting file with its name (the name comes URL-encoded)', async () => {
		fetchMock.mockResolvedValue(
			new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'x-file-name': encodeURIComponent('Étagère (1).stl') } }),
		);
		const file = await fetchInboxFile(id);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/import/${id}`);
		expect(file.name).toBe('Étagère (1).stl');
		expect([...file.bytes]).toEqual([1, 2, 3]);
	});

	it('names the file after its id when the server did not say', async () => {
		fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
		expect((await fetchInboxFile(id)).name).toBe('model');
	});

	it('says what the server said when nothing is waiting', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ error: 'Nothing is waiting there' }), { status: 404, headers: { 'content-type': 'application/json' } }),
		);
		await expect(fetchInboxFile(id)).rejects.toMatchObject({ status: 404, message: 'Nothing is waiting there' });
	});
});

describe('deleteInboxFile', () => {
	it('asks the server to forget the file', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
		await deleteInboxFile(id);
		expect(fetchMock.mock.calls[0]).toEqual([`/api/import/${id}`, { method: 'DELETE' }]);
	});

	it('does not mind when it cannot (the file is only waiting, and goes by itself)', async () => {
		fetchMock.mockRejectedValue(new Error('offline'));
		await expect(deleteInboxFile(id)).resolves.toBeUndefined();
	});
});
