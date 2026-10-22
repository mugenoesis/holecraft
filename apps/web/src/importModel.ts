import { type MeshData, type MeshShapeInput, normalizeMesh, reorientMesh, type UpAxis } from '@holecraft/core';
import { IMPORT_EXTENSIONS, importMeshFile, importMeshObjects } from '@holecraft/geometry';

/** For the file picker's `accept`. */
export const IMPORT_ACCEPT = [...IMPORT_EXTENSIONS, '.svg'].join(',');

/** How deep an imported SVG is extruded to start with, in mm: it can be resized like any shape afterwards. */
const SVG_DEPTH = 5;

/** Bigger files are refused before reading: a binary STL of three million triangles (the most a model may have) is 150 MB. */
const MAX_FILE_BYTES = 200 * 1024 * 1024;

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
	if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to import (the limit is 200 MB)');

	const isSvg = file.name.toLowerCase().endsWith('.svg');
	const imported = isSvg ? await importSvg(file, deps) : await importMeshFile(file.name, new Uint8Array(await file.arrayBuffer()));
	// an SVG is made flat on the floor already, so the up axis is for the other formats only
	const { mesh, size } = normalizeMesh(reorientMesh(imported, isSvg ? 'z' : (options.up ?? 'z')));
	const ref = await deps.upload(mesh);
	return { input: { name: imported.name.slice(0, 100), ref, size }, mesh };
}

/** One object of an imported file, ready to add: stored fitted to the unit box, and where it goes (the middle of its footprint, and how far above the plate). */
interface ImportedItem {
	input: MeshShapeInput;
	mesh: MeshData;
	at: [number, number];
	lift: number;
}

/** What a file brought in: its objects, and the size of all of them together. */
export interface ImportedModel {
	items: ImportedItem[];
	size: [number, number, number];
}

const boundsOf = (mesh: MeshData) => {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < mesh.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
			max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
		}
	}
	return { min: min as [number, number, number], max: max as [number, number, number] };
};

/**
 * Reads a model file as the objects it holds, each stored and described as a shape of its own: a 3MF with several objects (a slicer's plate) opens as
 * those objects, keeping where they stand in relation to each other (the whole is centred on the plate and put on it); anything else is one object.
 * Every object is checked before any is stored, so one that cannot be used (it is named) leaves nothing behind. Throws an error with a message fit
 * to show.
 */
export async function importModelObjects(
	file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
	deps: ImportDeps,
	options: { up?: UpAxis } = {},
): Promise<ImportedModel> {
	if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to import (the limit is 200 MB)');
	if (file.name.toLowerCase().endsWith('.svg')) {
		const { input, mesh } = await importModelFile(file, deps, options);
		return { items: [{ input, mesh, at: [0, 0], lift: 0 }], size: input.size };
	}

	const objects = await importMeshObjects(file.name, new Uint8Array(await file.arrayBuffer()));
	const up = options.up ?? 'z';
	const placed = objects.map((o) => {
		const turned = reorientMesh(o, up);
		const bounds = boundsOf(turned);
		try {
			return { name: o.name.slice(0, 100), bounds, ...normalizeMesh(turned) };
		} catch (error) {
			throw objects.length > 1 && error instanceof Error ? new Error(`${o.name}: ${error.message}`) : error;
		}
	});
	const all = {
		min: [0, 1, 2].map((k) => Math.min(...placed.map((p) => p.bounds.min[k]!))),
		max: [0, 1, 2].map((k) => Math.max(...placed.map((p) => p.bounds.max[k]!))),
	};
	const middle = [(all.min[0]! + all.max[0]!) / 2, (all.min[1]! + all.max[1]!) / 2];
	const items: ImportedItem[] = [];
	for (const p of placed) {
		const ref = await deps.upload(p.mesh);
		const single = placed.length === 1;
		items.push({
			input: { name: p.name, ref, size: p.size },
			mesh: p.mesh,
			at: single ? [0, 0] : [(p.bounds.min[0] + p.bounds.max[0]) / 2 - middle[0]!, (p.bounds.min[1] + p.bounds.max[1]) / 2 - middle[1]!],
			lift: single ? 0 : p.bounds.min[2] - all.min[2]!,
		});
	}
	return { items, size: [all.max[0]! - all.min[0]!, all.max[1]! - all.min[1]!, all.max[2]! - all.min[2]!] };
}
