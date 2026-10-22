import { addMeshShape, type Design, MAX_NAME_LENGTH, type MeshData, type MeshShapeInput } from '@holecraft/core';
import { readZip } from '@holecraft/geometry';

/*
 * What happens to a file the browser add-on sent: it is a model (open it) or a zip of them (open the one in it, or ask which), and the models
 * become shapes in a new design. Pure rules and the sequence of steps, with the network and the importer passed in so they are tested alone.
 */

const MODEL_EXTENSIONS = ['.stl', '.obj', '.3mf', '.svg'];

/** True for the name of a model the editor can read (STL, OBJ, 3MF or SVG). */
export function isModelName(name: string): boolean {
	const lower = name.toLowerCase();
	return MODEL_EXTENSIONS.some((e) => lower.endsWith(e) && lower.length > e.length);
}

/** The last part of a path inside a zip. */
export const baseName = (path: string): string => path.split('/').pop() ?? path;

/** The model files among a zip's entry names, in order of their own names (not their folders): not folders, hidden files, or what a Mac adds. */
export function modelEntries(names: Iterable<string>): string[] {
	return [...names]
		.filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/') && !baseName(n).startsWith('.') && isModelName(n))
		.sort((a, b) => baseName(a).localeCompare(baseName(b), 'en', { sensitivity: 'base' }) || a.localeCompare(b));
}

/** What to call a design made from a file: its name without the extension. */
export function designNameFor(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	const name = (dot > 0 ? fileName.slice(0, dot) : dot === 0 ? '' : fileName).trim();
	return name.slice(0, MAX_NAME_LENGTH) || 'Imported model';
}

/** Where to put models of these sizes ([width, depth, height] in mm) so they sit in a row along x with a gap, the row centred on the plate. */
export function rowLayout(sizes: readonly (readonly [number, number, number])[], gap = 10): [number, number][] {
	const total = sizes.reduce((sum, s) => sum + s[0], 0) + gap * Math.max(0, sizes.length - 1);
	let x = -total / 2;
	return sizes.map((s) => {
		const middle = x + s[0] / 2;
		x += s[0] + gap;
		return [middle, 0];
	});
}

/** A zip with more models than this starts with none ticked (a few parts of one thing are usually wanted together; a big pack is not). */
export const MAX_AUTO_SELECT = 12;

export interface ModelFile {
	name: string;
	bytes: Uint8Array;
}

/** What a waiting file turned out to be: models to open now, or models to choose from (a zip with several). */
export interface Opened {
	kind: 'models' | 'choose';
	/** The file as it arrived: what the design is named for. */
	title: string;
	files: ModelFile[];
}

/** Looks inside a waiting file. Throws an error with a message fit to show. */
export async function openInboxFile(file: ModelFile): Promise<Opened> {
	if (isModelName(file.name)) return { kind: 'models', title: file.name, files: [file] };
	if (!file.name.toLowerCase().endsWith('.zip')) {
		throw new Error('Holecraft can open STL, OBJ, 3MF or SVG files, or a zip with them in');
	}
	let entries: Map<string, Uint8Array>;
	try {
		entries = await readZip(file.bytes);
	} catch (error) {
		throw new Error(`That zip file could not be read: ${error instanceof Error ? error.message : 'it is damaged'}`);
	}
	const names = modelEntries(entries.keys());
	if (names.length === 0) throw new Error('There are no model files in that zip (Holecraft opens STL, OBJ, 3MF and SVG)');
	// the folder stays in the name only when two files would otherwise have the same one
	const bases = names.map(baseName);
	const files = names.map((n, i) => ({ name: bases.filter((b) => b === bases[i]).length > 1 ? n : bases[i]!, bytes: entries.get(n)! }));
	return { kind: files.length === 1 ? 'models' : 'choose', title: file.name, files };
}

export interface BuildDeps {
	/** Reads a model and stores it on the server. */
	importOne: (file: ModelFile) => Promise<{ input: MeshShapeInput; mesh: MeshData }>;
	create: (name: string) => Promise<Design>;
	save: (design: Design) => Promise<Design>;
}

/**
 * A new design named for the file, with each model as a shape in a row, saved. Every model is read before anything is made, so one that cannot be
 * read (it is named in the message) leaves nothing behind.
 */
export async function buildDesignFrom(title: string, files: readonly ModelFile[], deps: BuildDeps): Promise<Design> {
	const read: { input: MeshShapeInput }[] = [];
	for (const file of files) {
		try {
			read.push(await deps.importOne(file));
		} catch (error) {
			throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'it could not be imported'}`);
		}
	}
	const at = rowLayout(read.map((r) => r.input.size));
	let design = await deps.create(designNameFor(title));
	read.forEach((r, i) => {
		design = addMeshShape(design, r.input, { at: at[i]! }).design;
	});
	return deps.save(design);
}

/** What the waiting screen says while a file is read: for a big model, that it is big and will take a while (the page is busy while it works, so it cannot show progress). */
export function readingMessage(bytes: number): string {
	const mb = Math.round(bytes / (1024 * 1024));
	return mb >= 20 ? `Reading a large model (${mb} MB): this can take a little while…` : 'Opening the model…';
}
