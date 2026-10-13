import { type Design, DesignValidationError, type LibrarySummary, parseDesign } from '@holecraft/core';
import { ApiError, request } from './designsApi.ts';

const jsonInit = (method: string, body: unknown): RequestInit => ({
	method,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(body),
});

/** The shapes saved to the library, newest first. */
export async function listLibrary(): Promise<LibrarySummary[]> {
	return (await (await request('/api/library')).json()) as LibrarySummary[];
}

/** Saves a shape (a design with one root, see `libraryShapeOf`) as `name`. */
export async function saveToLibrary(name: string, design: Design): Promise<LibrarySummary> {
	return (await (await request('/api/library', jsonInit('POST', { name, design }))).json()) as LibrarySummary;
}

/** A saved shape, checked like any design on the way in. */
export async function getLibraryShape(id: string): Promise<Design> {
	const response = await request(`/api/library/${id}`);
	try {
		return parseDesign(await response.json());
	} catch (error) {
		const detail = error instanceof DesignValidationError ? error.message : 'it is not a design';
		throw new ApiError(500, `This saved shape could not be read: ${detail}`);
	}
}

export async function renameLibraryShape(id: string, name: string): Promise<LibrarySummary> {
	return (await (await request(`/api/library/${id}`, jsonInit('PATCH', { name }))).json()) as LibrarySummary;
}

export async function deleteLibraryShape(id: string): Promise<void> {
	await request(`/api/library/${id}`, { method: 'DELETE' });
}
