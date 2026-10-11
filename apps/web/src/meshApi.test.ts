import { encodeMesh, type MeshData } from '@holecraft/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './designsApi.ts';
import { fetchMesh, uploadMesh } from './meshApi.ts';

const REF = 'a'.repeat(64);
const tetra = (): MeshData => ({
	positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('uploadMesh', () => {
	it('sends the encoded mesh as raw bytes and returns the reference', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ ref: REF }), { status: 201, headers: { 'content-type': 'application/json' } }),
		);
		const ref = await uploadMesh(tetra());
		expect(ref).toBe(REF);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/meshes');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>)['content-type']).toBe('application/octet-stream');
		expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(encodeMesh(tetra()));
	});

	it('refuses a reply that is not a proper reference', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ ref: '../x' }), { status: 201 }));
		await expect(uploadMesh(tetra())).rejects.toBeInstanceOf(ApiError);
	});

	it("passes on the server's reason when it refuses the model", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Not a valid stored mesh' }), { status: 400 }));
		await expect(uploadMesh(tetra())).rejects.toThrow('Not a valid stored mesh');
	});
});

describe('fetchMesh', () => {
	it('downloads and decodes a model', async () => {
		fetchMock.mockResolvedValue(new Response(new Blob([encodeMesh(tetra()) as BlobPart]), { status: 200 }));
		const mesh = await fetchMesh(REF);
		expect(fetchMock.mock.calls[0]![0]).toBe(`/api/meshes/${REF}`);
		expect([...mesh.indices]).toEqual([...tetra().indices]);
	});

	it('refuses a reference that is not a proper one without asking the server', async () => {
		await expect(fetchMesh('../etc/passwd')).rejects.toThrow(/reference/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses bytes that are not a valid mesh', async () => {
		fetchMock.mockResolvedValue(new Response(new Blob([new Uint8Array(30) as BlobPart]), { status: 200 }));
		await expect(fetchMesh(REF)).rejects.toThrow(/mesh/i);
	});
});
