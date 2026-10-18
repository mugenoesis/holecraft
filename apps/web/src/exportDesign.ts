import type { Design, MeshData } from '@holecraft/core';
import { type ExportBody, exportFileName, write3mf, writeObj, writeStl } from '@holecraft/geometry';
import { downloadFile } from './download.ts';
import { exportBodiesInWorker } from './geometry/exportInWorker.ts';

export type ExportFormat = 'stl' | 'obj' | '3mf' | 'orca3mf';

export const EXPORT_FORMATS: ReadonlyArray<{ id: ExportFormat; label: string; hint: string; mime: string; extension: string }> = [
	{ id: 'stl', label: 'STL', hint: 'Best for 3D printing', mime: 'model/stl', extension: 'stl' },
	{ id: 'obj', label: 'OBJ', hint: 'Widely supported mesh', mime: 'text/plain', extension: 'obj' },
	{ id: '3mf', label: '3MF', hint: 'For viewers, not slicers', mime: 'model/3mf', extension: '3mf' },
	{ id: 'orca3mf', label: '3MF for OrcaSlicer', hint: 'Multi-colour filaments', mime: 'model/3mf', extension: '3mf' },
];

export interface ExportDeps {
	/** Works out what to print: each solid with its holes cut, in the world. */
	bodies: (design: Design) => Promise<ExportBody[]>;
	save: (fileName: string, data: Uint8Array | string, mime: string) => void;
}

/** The real thing: the geometry worker, given the imported models the design uses, and a browser download. */
export function exportDeps(meshes: ReadonlyMap<string, MeshData>): ExportDeps {
	return { bodies: (design) => exportBodiesInWorker(design, meshes), save: downloadFile };
}

/** The same design with only the selected top-level shapes and groups left to export. */
export function onlySelected(design: Design, selection: readonly string[]): Design {
	const chosen = new Set(selection);
	return { ...design, roots: design.roots.filter((id) => chosen.has(id)) };
}

/** True if there is at least one visible, solid, top-level shape or group, so an export could produce something. */
export function hasExportableShapes(design: Design): boolean {
	return design.roots.some((id) => {
		const node = design.nodes[id];
		return !!node && node.kind !== 'mesh' && node.mode === 'solid' && !node.hidden;
	});
}

/** A built export: the file's name, its bytes and its media type. */
interface BuiltExport {
	fileName: string;
	data: Uint8Array | string;
	mime: string;
}

async function buildExport(design: Design, format: ExportFormat, deps: ExportDeps): Promise<BuiltExport> {
	const bodies = await deps.bodies(design);
	if (bodies.length === 0) throw new Error('Nothing to export: there are no solid shapes in this design');

	const info = EXPORT_FORMATS.find((f) => f.id === format)!;
	const data =
		format === 'stl'
			? writeStl(bodies)
			: format === 'obj'
				? writeObj(bodies)
				: format === 'orca3mf'
					? write3mf(bodies, { filaments: design.palette })
					: write3mf(bodies);
	return { fileName: exportFileName(design.name, info.extension), data, mime: info.mime };
}

/**
 * Exports the whole design as a file download. Throws, with a message fit to show, if there is
 * nothing to export (every solid is a hole, hidden, or has been cut away completely).
 */
export async function runExport(design: Design, format: ExportFormat, deps: ExportDeps): Promise<void> {
	const built = await buildExport(design, format, deps);
	deps.save(built.fileName, built.data, built.mime);
}

/** The "3MF for OrcaSlicer" file, kept in memory instead of downloaded: what is sent to Trident. */
export async function exportOrcaBytes(design: Design, deps: ExportDeps): Promise<{ fileName: string; data: Uint8Array }> {
	const built = await buildExport(design, 'orca3mf', deps);
	return { fileName: built.fileName, data: built.data as Uint8Array };
}

/** The design as the bytes of a binary STL, kept in memory instead of downloaded: what is sent to Trident to be hollowed. */
export async function exportStlBytes(design: Design, deps: ExportDeps): Promise<{ fileName: string; data: Uint8Array }> {
	const built = await buildExport(design, 'stl', deps);
	return { fileName: built.fileName, data: built.data as Uint8Array };
}
