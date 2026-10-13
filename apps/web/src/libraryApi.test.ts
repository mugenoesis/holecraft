import { addShape, createEmptyDesign, libraryShapeOf } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './designsApi.ts';
import { deleteLibraryShape, getLibraryShape, listLibrary, renameLibraryShape, saveToLibrary } from './libraryApi.ts';

const id = '0123456789abcdef0123456789abcdef';
let fetchMock: ReturnType<typeof vi.fn>;
const reply = (status: number, body?: unknown) =>
	Promise.resolve(
		new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
	);
const lastCall = () => {
	const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
	return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined };
};
const shape = () => libraryShapeOf(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, 'a', 'Box')!;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('libraryApi', () => {
	it('lists the saved shapes', async () => {
		const summary = { id, name: 'Box', color: '#f28c28', createdAt: 'x' };
		fetchMock.mockReturnValue(reply(200, [summary]));
		expect(await listLibrary()).toEqual([summary]);
		expect(lastCall()).toMatchObject({ url: '/api/library', method: 'GET' });
	});

	it('saves a shape with its name', async () => {
		const summary = { id, name: 'My box', color: '#f28c28', createdAt: 'x' };
		fetchMock.mockReturnValue(reply(201, summary));
		const design = shape();
		expect(await saveToLibrary('My box', design)).toEqual(summary);
		expect(lastCall()).toMatchObject({ url: '/api/library', method: 'POST' });
		expect(lastCall().body.name).toBe('My box');
		expect(lastCall().body.design.roots).toEqual(design.roots);
	});

	it('opens a saved shape as a checked design', async () => {
		fetchMock.mockReturnValue(reply(200, shape()));
		const got = await getLibraryShape(id);
		expect(lastCall()).toMatchObject({ url: `/api/library/${id}`, method: 'GET' });
		expect(got.roots).toHaveLength(1);
	});

	it('says so, rather than handing back rubbish, when what comes back is not a design', async () => {
		fetchMock.mockReturnValue(reply(200, { nonsense: true }));
		await expect(getLibraryShape(id)).rejects.toThrow(/could not be read/);
	});

	it('renames and deletes', async () => {
		fetchMock.mockReturnValue(reply(200, { id, name: 'New', color: '#000000', createdAt: 'x' }));
		await renameLibraryShape(id, 'New');
		expect(lastCall()).toMatchObject({ url: `/api/library/${id}`, method: 'PATCH', body: { name: 'New' } });
		fetchMock.mockReturnValue(reply(204));
		await deleteLibraryShape(id);
		expect(lastCall()).toMatchObject({ url: `/api/library/${id}`, method: 'DELETE' });
	});

	it('turns a refusal into an error with the server’s message', async () => {
		fetchMock.mockImplementation(() => reply(400, { error: 'name must not be blank' }));
		await expect(saveToLibrary(' ', shape())).rejects.toThrow(ApiError);
		await expect(saveToLibrary(' ', shape())).rejects.toThrow('name must not be blank');
	});
});
