import { createEmptyDesign } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ApiError,
	createDesign,
	deleteDesign,
	duplicateDesign,
	getDesign,
	listDesigns,
	renameDesignOnServer,
	saveDesign,
} from './designsApi.ts';

const id = '0123456789abcdef0123456789abcdef';
let fetchMock: ReturnType<typeof vi.fn>;

function reply(status: number, body?: unknown) {
	return Promise.resolve(
		new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
	);
}

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
	const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
	return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined, init };
};

describe('designsApi', () => {
	it('lists designs', async () => {
		fetchMock.mockReturnValue(reply(200, [{ id, name: 'A', createdAt: 'x', updatedAt: 'y', objectCount: 2 }]));
		const list = await listDesigns();
		expect(lastCall()).toMatchObject({ url: '/api/designs', method: 'GET' });
		expect(list).toEqual([{ id, name: 'A', createdAt: 'x', updatedAt: 'y', objectCount: 2 }]);
	});

	it('creates a design, optionally with a name', async () => {
		const design = createEmptyDesign(id, 'Gear');
		fetchMock.mockReturnValue(reply(201, design));
		expect(await createDesign('Gear')).toEqual(design);
		expect(lastCall()).toMatchObject({ url: '/api/designs', method: 'POST', body: { name: 'Gear' } });
	});

	it('opens a design and checks what comes back is a valid design', async () => {
		const design = createEmptyDesign(id);
		fetchMock.mockReturnValue(reply(200, design));
		expect(await getDesign(id)).toEqual(design);
		expect(lastCall().url).toBe(`/api/designs/${id}`);

		fetchMock.mockReturnValue(reply(200, { nonsense: true }));
		await expect(getDesign(id)).rejects.toThrow(/could not be read|invalid/i);
	});

	it('saves a design with PUT', async () => {
		const design = createEmptyDesign(id, 'Plate');
		fetchMock.mockReturnValue(reply(200, design));
		await saveDesign(design);
		expect(lastCall()).toMatchObject({ url: `/api/designs/${id}`, method: 'PUT', body: design });
	});

	it('can keep a save going while the page is closing', async () => {
		fetchMock.mockReturnValue(reply(200, createEmptyDesign(id)));
		await saveDesign(createEmptyDesign(id), { keepalive: true });
		expect(lastCall().init?.keepalive).toBe(true);
	});

	it('renames, duplicates and deletes', async () => {
		fetchMock.mockReturnValue(reply(200, createEmptyDesign(id, 'New')));
		await renameDesignOnServer(id, 'New');
		expect(lastCall()).toMatchObject({ url: `/api/designs/${id}`, method: 'PATCH', body: { name: 'New' } });

		fetchMock.mockReturnValue(reply(201, createEmptyDesign(id, 'Copy of New')));
		await duplicateDesign(id);
		expect(lastCall()).toMatchObject({ url: `/api/designs/${id}/duplicate`, method: 'POST' });

		fetchMock.mockReturnValue(reply(204));
		await deleteDesign(id);
		expect(lastCall()).toMatchObject({ url: `/api/designs/${id}`, method: 'DELETE' });
	});

	it("turns an error reply into an ApiError carrying the status and the server's message", async () => {
		fetchMock.mockReturnValue(reply(404, { error: 'Design not found' }));
		const error = await getDesign(id).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({ status: 404, message: 'Design not found' });
	});

	it('copes with an error reply that is not JSON', async () => {
		fetchMock.mockReturnValue(Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })));
		const error = (await listDesigns().catch((e: unknown) => e)) as ApiError;
		expect(error.status).toBe(502);
		expect(error.message).toMatch(/server/i);
	});

	it('reports an unreachable server as status 0', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		const error = (await listDesigns().catch((e: unknown) => e)) as ApiError;
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(0);
		expect(error.message).toMatch(/reach the server/i);
	});

	it('says which failures are worth retrying: network trouble and server errors, not rejections', () => {
		expect(new ApiError(0, 'x').retryable).toBe(true);
		expect(new ApiError(500, 'x').retryable).toBe(true);
		expect(new ApiError(503, 'x').retryable).toBe(true);
		expect(new ApiError(400, 'x').retryable).toBe(false);
		expect(new ApiError(404, 'x').retryable).toBe(false);
		expect(new ApiError(413, 'x').retryable).toBe(false);
	});
});

describe('saving from a version, and being refused for a newer one', () => {
	const sentHeaders = () => (lastCall().init?.headers ?? {}) as Record<string, string>;

	it('says which version the save is based on, in a header', async () => {
		fetchMock.mockReturnValue(reply(200, createEmptyDesign(id)));
		await saveDesign(createEmptyDesign(id), { base: '2026-01-01T10:00:00.000Z' });
		expect(sentHeaders()['x-base-updated-at']).toBe('2026-01-01T10:00:00.000Z');
	});

	it('says nothing about a base when there is none', async () => {
		fetchMock.mockReturnValue(reply(200, createEmptyDesign(id)));
		await saveDesign(createEmptyDesign(id));
		expect(sentHeaders()['x-base-updated-at']).toBeUndefined();
	});

	it('turns a 409 into an error that says it is a conflict, with when the other version was saved, and is not worth retrying', async () => {
		fetchMock.mockReturnValue(reply(409, { error: 'This design was changed somewhere else', updatedAt: '2026-01-01T10:05:00.000Z' }));
		const error = (await saveDesign(createEmptyDesign(id), { base: 'x' }).catch((e: unknown) => e)) as ApiError;
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(409);
		expect(error.conflict).toBe(true);
		expect(error.updatedAt).toBe('2026-01-01T10:05:00.000Z');
		expect(error.retryable).toBe(false);
		expect(error.message).toMatch(/changed somewhere else/);
	});

	it('does not call other errors conflicts', async () => {
		fetchMock.mockReturnValue(reply(404, { error: 'Design not found' }));
		const error = (await saveDesign(createEmptyDesign(id)).catch((e: unknown) => e)) as ApiError;
		expect(error.conflict).toBe(false);
		expect(error.updatedAt).toBeUndefined();
	});
});
