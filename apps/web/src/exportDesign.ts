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

export type BelowPlaneChoice = 'cut' | 'keep' | 'cancel';

export interface ExportDeps {
	/** Works out what to print: each solid with its holes cut, in the world (and, if asked, cut off at the workplane). */
	bodies: (design: Design, options?: { cutBelowPlane?: boolean }) => Promise<ExportBody[]>;
	save: (fileName: string, data: Uint8Array | string, mime: string) => void;
	/** Asked when part of the design is below the workplane: cut it off, export it as it is, or cancel. Without it the part is kept. */
	belowPlane?: () => Promise<BelowPlaneChoice>;
}

/** Thrown when the user cancels an export at the below-the-plane question: not a failure, so nothing is shown. */
export class ExportCancelled extends Error {
	constructor() {
		super('The export was cancelled');
		this.name = 'ExportCancelled';
	}
}

/** Whether any body has a corner below the workplane (z under 0). */
export function reachesBelowPlane(bodies: readonly ExportBody[]): boolean {
	return bodies.some((b) => {
		for (let i = 2; i < b.mesh.positions.length; i += 3) if (b.mesh.positions[i]! < -1e-4) return true;
		return false;
	});
}

/** The real thing: the geometry worker, given the imported models the design uses, and a browser download. */
export function exportDeps(meshes: ReadonlyMap<string, MeshData>, belowPlane?: () => Promise<BelowPlaneChoice>): ExportDeps {
	return {
		bodies: (design, options) => exportBodiesInWorker(design, meshes, options),
		save: downloadFile,
		...(belowPlane ? { belowPlane } : {}),
	};
}

/** The same design with only the selected top-level shapes and groups left to export. */
export function onlySelected(design: Design, selection: readonly string[]): Design {
	const chosen = new Set(selection);
	// support points are numbered for the whole design's objects, so they do not go with a part of it
	const { supports: _supports, ...rest } = design;
	return { ...rest, roots: design.roots.filter((id) => chosen.has(id)) };
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

/** The bodies to export: as they are, or (when some are below the workplane and the user says so) cut off at it. Throws `ExportCancelled` on cancel. */
async function settleBelowPlane(design: Design, bodies: ExportBody[], deps: ExportDeps): Promise<ExportBody[]> {
	if (!deps.belowPlane || !reachesBelowPlane(bodies)) return bodies;
	const choice = await deps.belowPlane();
	if (choice === 'cancel') throw new ExportCancelled();
	if (choice === 'keep') return bodies;
	const cut = await deps.bodies(design, { cutBelowPlane: true });
	if (cut.length === 0) throw new Error('Nothing is left above the workplane to export: move the design up, or keep the part below it');
	return cut;
}

async function buildExport(design: Design, format: ExportFormat, deps: ExportDeps): Promise<BuiltExport> {
	const whole = await deps.bodies(design);
	if (whole.length === 0) throw new Error('Nothing to export: there are no solid shapes in this design');
	const bodies = await settleBelowPlane(design, whole, deps);

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
