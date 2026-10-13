import { parseObj } from './obj.ts';
import { parseStl } from './stl.ts';
import { parse3mf } from './threemf.ts';
import type { RawMesh } from './weld.ts';

export { parseObj } from './obj.ts';
export { parseStl } from './stl.ts';
export { parseSvg, type SvgOutline } from './svg.ts';
export { svgToMesh } from './svgSolid.ts';
export { parse3mf } from './threemf.ts';
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
