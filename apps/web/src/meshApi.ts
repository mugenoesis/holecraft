import { decodeMesh, encodeMesh, isMeshRef, type MeshData } from '@holecraft/core';
import { ApiError, request } from './designsApi.ts';

/** Stores a model on the server and returns the reference to put in the design. */
export async function uploadMesh(mesh: MeshData): Promise<string> {
  const bytes = encodeMesh(mesh);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const response = await request('/api/meshes', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body });
  const reply = (await response.json()) as { ref?: unknown };
  if (!isMeshRef(reply.ref)) throw new ApiError(502, 'The server sent back something unexpected');
  return reply.ref;
}

/** Downloads a stored model and checks it. */
export async function fetchMesh(ref: string): Promise<MeshData> {
  if (!isMeshRef(ref)) throw new Error('That is not a valid model reference');
  const response = await request(`/api/meshes/${ref}`);
  return decodeMesh(new Uint8Array(await response.arrayBuffer()));
}
