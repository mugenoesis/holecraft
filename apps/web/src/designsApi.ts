import { type Design, type DesignSummary, DesignValidationError, parseDesign } from '@holecraft/core';

/** A failed call to the server. `status` is 0 when the server could not be reached at all. */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		/** For a conflict: when the version that is stored now was saved. */
		readonly updatedAt?: string | undefined,
	) {
		super(message);
		this.name = 'ApiError';
	}

	/** The design was saved from somewhere else since this version was opened (HTTP 409). */
	get conflict(): boolean {
		return this.status === 409;
	}

	/** Worth trying again: the server was unreachable or had a problem, as opposed to refusing the request. */
	get retryable(): boolean {
		return this.status === 0 || this.status >= 500;
	}
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(url, init);
	} catch {
		throw new ApiError(0, 'Could not reach the server');
	}
	if (response.ok) return response;

	let message = `The server returned an error (${response.status})`;
	let updatedAt: string | undefined;
	try {
		const body = (await response.json()) as { error?: unknown; updatedAt?: unknown };
		if (typeof body.error === 'string') message = body.error;
		if (typeof body.updatedAt === 'string') updatedAt = body.updatedAt;
	} catch {
		// Not JSON (a proxy's error page, say): keep the generic message.
	}
	throw new ApiError(response.status, message, updatedAt);
}

const jsonInit = (method: string, body: unknown, extra: RequestInit = {}): RequestInit => ({
	method,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body),
	...extra,
});

/** Designs come back through the same validation as files on disk, so nothing odd gets into the editor. */
async function readDesign(response: Response): Promise<Design> {
	try {
		return parseDesign(await response.json());
	} catch (error) {
		const detail = error instanceof DesignValidationError ? error.message : 'it is not a design';
		throw new ApiError(500, `This design could not be read: ${detail}`);
	}
}

export async function listDesigns(): Promise<DesignSummary[]> {
	return (await (await request('/api/designs')).json()) as DesignSummary[];
}

export async function createDesign(name?: string): Promise<Design> {
	return readDesign(await request('/api/designs', jsonInit('POST', name === undefined ? {} : { name })));
}

export async function getDesign(id: string): Promise<Design> {
	return readDesign(await request(`/api/designs/${id}`));
}

/**
 * `keepalive` lets the request finish even as the page is being closed. `base` is the modification time of the version this one was made from:
 * the server refuses the save (a conflict, HTTP 409) if the design has been saved from somewhere else since.
 */
export async function saveDesign(design: Design, opts: { keepalive?: boolean; base?: string } = {}): Promise<Design> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (opts.base !== undefined) headers['x-base-updated-at'] = opts.base;
	const init: RequestInit = { method: 'PUT', headers, body: JSON.stringify(design), ...(opts.keepalive ? { keepalive: true } : {}) };
	return readDesign(await request(`/api/designs/${design.id}`, init));
}

export async function renameDesignOnServer(id: string, name: string): Promise<Design> {
	return readDesign(await request(`/api/designs/${id}`, jsonInit('PATCH', { name })));
}

export async function duplicateDesign(id: string): Promise<Design> {
	return readDesign(await request(`/api/designs/${id}/duplicate`, { method: 'POST' }));
}

export async function deleteDesign(id: string): Promise<void> {
	await request(`/api/designs/${id}`, { method: 'DELETE' });
}

/** Stores the small picture of a design that the designs list shows. */
export async function uploadThumbnail(id: string, picture: Blob): Promise<void> {
	await request(`/api/designs/${id}/thumbnail`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: picture });
}

/** Where to load a design's picture from, or null if it has none. The time makes each new picture a new address. */
export function thumbnailUrl(design: { id: string; thumbnailAt?: number }): string | null {
	return design.thumbnailAt === undefined ? null : `/api/designs/${design.id}/thumbnail?v=${design.thumbnailAt}`;
}

/** Puts a design in a folder (a name, which makes the folder if it is new) or takes it out of its folder (null). */
export async function moveDesignToFolder(id: string, folder: string | null): Promise<Design> {
	return readDesign(await request(`/api/designs/${id}`, jsonInit('PATCH', { folder })));
}

/** Renames a folder for every design in it. */
export async function renameFolderOnServer(from: string, to: string): Promise<void> {
	await request('/api/design-folders/rename', jsonInit('POST', { from, to }));
}

/** Takes a folder apart: its designs are kept, in no folder. */
export async function removeFolderOnServer(name: string): Promise<void> {
	await request('/api/design-folders/remove', jsonInit('POST', { name }));
}
