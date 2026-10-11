import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { thumbnailUrl, uploadThumbnail } from './designsApi.ts';

const id = '0123456789abcdef0123456789abcdef';
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('thumbnailUrl', () => {
  it('is the picture\'s address with its time on the end, so a new picture means a new address', () => {
    expect(thumbnailUrl({ id, thumbnailAt: 1234 })).toBe(`/api/designs/${id}/thumbnail?v=1234`);
  });

  it('is null for a design with no picture yet', () => {
    expect(thumbnailUrl({ id })).toBeNull();
  });
});

describe('uploadThumbnail', () => {
  it('sends the picture as a PNG', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await uploadThumbnail(id, blob);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/designs/${id}/thumbnail`);
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['content-type']).toBe('image/png');
    expect(init.body).toBe(blob);
  });

  it('fails with the server\'s reason when it is refused', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'That is not a usable thumbnail' }), { status: 400 }));
    await expect(uploadThumbnail(id, new Blob([]))).rejects.toThrow('That is not a usable thumbnail');
  });
});
