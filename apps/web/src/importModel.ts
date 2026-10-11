import { type MeshData, type MeshShapeInput, normalizeMesh } from '@holecraft/core';
import { IMPORT_EXTENSIONS, importMeshFile } from '@holecraft/geometry';

/** For the file picker's `accept`. */
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(',');

/** Bigger files are refused before reading: about a million triangles fit well inside this. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface ImportDeps {
	/** Stores a model on the server and returns its reference. */
	upload: (mesh: MeshData) => Promise<string>;
}

/**
 * Reads an STL, OBJ or 3MF file, fits it into the unit box shapes are built in, and stores it.
 * Returns what to add to the design, and the model itself so it can be drawn straight away.
 * Throws an error with a message fit to show.
 */
export async function importModelFile(
	file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
	deps: ImportDeps,
): Promise<{ input: MeshShapeInput; mesh: MeshData }> {
	if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to import (the limit is 100 MB)');

	const imported = await importMeshFile(file.name, new Uint8Array(await file.arrayBuffer()));
	const { mesh, size } = normalizeMesh(imported);
	const ref = await deps.upload(mesh);
	return { input: { name: imported.name.slice(0, 100), ref, size }, mesh };
}
