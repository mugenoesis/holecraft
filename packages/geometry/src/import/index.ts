import { parseObj } from './obj.ts';
import { parseStl } from './stl.ts';
import { parse3mf, parse3mfObjects } from './threemf.ts';
import type { RawMesh } from './weld.ts';

export { parseObj } from './obj.ts';
export { parseStl } from './stl.ts';
export { parseSvg, type SvgOutline } from './svg.ts';
export { svgToMesh } from './svgSolid.ts';
export { parse3mf, parse3mfObjects, type ThreeMfObject } from './threemf.ts';
export { MAX_IMPORT_TRIANGLES, type RawMesh, weldMesh } from './weld.ts';

/** A mesh read from a file: millimetres, Z up, corners joined. */
export interface ImportedMesh extends RawMesh {
	/** The file's name without its extension, to name the new shape. */
	name: string;
}

export const IMPORT_EXTENSIONS = ['.stl', '.obj', '.3mf'] as const;

/** Reads an STL, OBJ or 3MF file. Throws an error with a message fit to show the user. */
export async function importMeshFile(fileName: string, bytes: Uint8Array): Promise<ImportedMesh> {
	const dot = fileName.lastIndexOf('.');
	const extension = dot < 0 ? '' : fileName.slice(dot).toLowerCase();
	const name = (dot > 0 ? fileName.slice(0, dot) : fileName).trim() || 'Imported model';

	let mesh: RawMesh;
	if (extension === '.stl') mesh = parseStl(bytes);
	else if (extension === '.obj') mesh = parseObj(new TextDecoder().decode(bytes));
	else if (extension === '.3mf') mesh = await parse3mf(bytes);
	else throw new Error('Holecraft can import STL, OBJ, 3MF or SVG files');

	if (mesh.indices.length === 0) throw new Error('There is nothing to import: the file has no usable triangles');
	return { name, ...mesh };
}

/**
 * Reads a model file as the objects it holds: a 3MF with several objects gives a mesh for each, named by the file's own names (or the file's name and
 * a number), in the file's own coordinates so their layout can be kept; anything else is one mesh named for the file, as importMeshFile gives.
 */
export async function importMeshObjects(fileName: string, bytes: Uint8Array): Promise<ImportedMesh[]> {
	if (!fileName.toLowerCase().endsWith('.3mf')) return [await importMeshFile(fileName, bytes)];
	const base = (fileName.lastIndexOf('.') > 0 ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName).trim() || 'Imported model';
	const objects = await parse3mfObjects(bytes);
	if (objects.length === 1) return [{ name: base, ...objects[0]!.mesh }];
	return objects.map((o, i) => ({ name: o.name ?? `${base} ${i + 1}`, ...o.mesh }));
}
