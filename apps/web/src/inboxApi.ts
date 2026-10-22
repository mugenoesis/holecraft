import { request } from './designsApi.ts';

/** A model file sent by the browser add-on that is waiting to be opened. */
export async function fetchInboxFile(id: string): Promise<{ name: string; bytes: Uint8Array }> {
	const response = await request(`/api/import/${id}`);
	const raw = response.headers.get('x-file-name');
	let name = 'model';
	try {
		if (raw) name = decodeURIComponent(raw);
	} catch {
		// keep the plain name
	}
	return { name, bytes: new Uint8Array(await response.arrayBuffer()) };
}

/** Lets the server forget a file once it has been opened. It would go by itself within a day, so a failure here is ignored. */
export async function deleteInboxFile(id: string): Promise<void> {
	try {
		await request(`/api/import/${id}`, { method: 'DELETE' });
	} catch {
		// nothing to do
	}
}
