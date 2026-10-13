import { type MeshData, type MeshShapeInput, normalizeMesh, reorientMesh, type UpAxis } from '@holecraft/core';
import { IMPORT_EXTENSIONS, importMeshFile } from '@holecraft/geometry';

/** For the file picker's `accept`. */
export const IMPORT_ACCEPT = [...IMPORT_EXTENSIONS, '.svg'].join(',');

/** How deep an imported SVG is extruded to start with, in mm: it can be resized like any shape afterwards. */
const SVG_DEPTH = 5;

/** Bigger files are refused before reading: about a million triangles fit well inside this. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export interface ImportDeps {
	/** Stores a model on the server and returns its reference. */
	upload: (mesh: MeshData) => Promise<string>;
	/** Extrudes an SVG's text `depth` mm into a solid (the geometry worker does it). Rejects with a message fit to show. */
	extrudeSvg?: (text: string, depth: number) => Promise<MeshData>;
}

/** An SVG as a solid, named after the file (without .svg). */
async function importSvg(
	file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
	deps: ImportDeps,
): Promise<MeshData & { name: string }> {
	if (!deps.extrudeSvg) throw new Error('SVG files cannot be imported here');
	const text = new TextDecoder().decode(await file.arrayBuffer());
	const mesh = await deps.extrudeSvg(text, SVG_DEPTH);
	return { ...mesh, name: file.name.replace(/\.svg$/i, '').trim() || 'SVG' };
}

/**
 * Reads an STL, OBJ, 3MF or SVG file, fits it into the unit box shapes are built in, and stores it.
 * Returns what to add to the design, and the model itself so it can be drawn straight away.
 * Throws an error with a message fit to show.
 */
export async function importModelFile(
	file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
	deps: ImportDeps,
	/** Which of the file's axes is up (Z, unless the file was made by something that makes Y the height). */
	options: { up?: UpAxis } = {},
): Promise<{ input: MeshShapeInput; mesh: MeshData }> {
	if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to import (the limit is 100 MB)');

	const isSvg = file.name.toLowerCase().endsWith('.svg');
	const imported = isSvg ? await importSvg(file, deps) : await importMeshFile(file.name, new Uint8Array(await file.arrayBuffer()));
	// an SVG is made flat on the floor already, so the up axis is for the other formats only
	const { mesh, size } = normalizeMesh(reorientMesh(imported, isSvg ? 'z' : (options.up ?? 'z')));
	const ref = await deps.upload(mesh);
	return { input: { name: imported.name.slice(0, 100), ref, size }, mesh };
}
