import { addShape, createEmptyDesign, type Design, renameDesign, setSupportPoints } from '@holecraft/core';
import type { ExportBody } from '@holecraft/geometry';
import { readStoredZip } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import {
	EXPORT_FORMATS,
	ExportCancelled,
	exportStlBytes,
	hasExportableShapes,
	onlySelected,
	reachesBelowPlane,
	runExport,
} from './exportDesign.ts';

const body = (name = 'Box 1'): ExportBody => ({
	name,
	color: '#f28c28',
	mesh: {
		positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
		indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
	},
});

function design(name = 'Bracket'): Design {
	return renameDesign(createEmptyDesign('d', 'Untitled design'), name);
}

function deps(bodies: ExportBody[] = [body()]) {
	return { bodies: vi.fn().mockResolvedValue(bodies), save: vi.fn() };
}

describe('EXPORT_FORMATS', () => {
	it('offers STL, OBJ, 3MF and 3MF for OrcaSlicer, each with a file extension', () => {
		expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['stl', 'obj', '3mf', 'orca3mf']);
		for (const f of EXPORT_FORMATS) expect(f.label.length).toBeGreaterThan(0);
	});

	it('says plain 3MF colours are for viewers, and sends multi-colour printing to the OrcaSlicer option', () => {
		const hint = (id: string) => EXPORT_FORMATS.find((f) => f.id === id)?.hint ?? '';
		expect(hint('3mf')).toMatch(/not slicers/i);
		expect(hint('orca3mf')).toMatch(/multi-colou?r/i);
		// the menu is a row of label + hint with no wrapping, so a long hint widens it
		for (const f of EXPORT_FORMATS) expect(f.hint.length).toBeLessThanOrEqual(32);
	});
});

describe('runExport', () => {
	it('builds the file and hands it to be saved, named after the design', async () => {
		const d = deps();
		await runExport(design('Bracket'), 'stl', d);
		expect(d.save).toHaveBeenCalledTimes(1);
		const [fileName, data, mime] = d.save.mock.calls[0]!;
		expect(fileName).toBe('Bracket.stl');
		expect(mime).toBe('model/stl');
		expect(data).toBeInstanceOf(Uint8Array);
		expect(new DataView((data as Uint8Array).buffer).getUint32(80, true)).toBe(4);
	});

	it('writes OBJ as text', async () => {
		const d = deps();
		await runExport(design(), 'obj', d);
		const [fileName, data, mime] = d.save.mock.calls[0]!;
		expect(fileName).toBe('Bracket.obj');
		expect(mime).toBe('text/plain');
		expect(String(data)).toContain('o Box 1');
	});

	it('writes 3MF as a zip', async () => {
		const d = deps();
		await runExport(design(), '3mf', d);
		const [fileName, data, mime] = d.save.mock.calls[0]!;
		expect(fileName).toBe('Bracket.3mf');
		expect(mime).toBe('model/3mf');
		expect(readStoredZip(data as Uint8Array).has('3D/3dmodel.model')).toBe(true);
	});

	it('makes the file name safe', async () => {
		const d = deps();
		await runExport(design('a/b:c'), 'stl', d);
		expect(d.save.mock.calls[0]![0]).toBe('a-b-c.stl');
	});

	it('gives the design to the geometry worker', async () => {
		const d = deps();
		const doc = addShape(design(), 'box', [0, 0]).design;
		await runExport(doc, 'stl', d);
		expect(d.bodies).toHaveBeenCalledWith(doc);
	});

	it('says so, and saves nothing, when nothing is left to export', async () => {
		const d = deps([]);
		await expect(runExport(design(), 'stl', d)).rejects.toThrow(/nothing to export/i);
		expect(d.save).not.toHaveBeenCalled();
	});

	it('passes on a failure from the worker', async () => {
		const d = { bodies: vi.fn().mockRejectedValue(new Error('worker crashed')), save: vi.fn() };
		await expect(runExport(design(), 'stl', d)).rejects.toThrow('worker crashed');
		expect(d.save).not.toHaveBeenCalled();
	});
});

describe('hasExportableShapes', () => {
	it('is false for an empty design', () => {
		expect(hasExportableShapes(design())).toBe(false);
	});

	it('is true once there is a visible solid shape', () => {
		expect(hasExportableShapes(addShape(design(), 'box', [0, 0]).design)).toBe(true);
	});

	it('is false when everything is a hole or hidden', () => {
		const d = addShape(design(), 'box', [0, 0], { id: 'a' }).design;
		d.nodes.a!.mode = 'hole';
		expect(hasExportableShapes(d)).toBe(false);
		d.nodes.a!.mode = 'solid';
		d.nodes.a!.hidden = true;
		expect(hasExportableShapes(d)).toBe(false);
	});
});

describe('exportStlBytes', () => {
	it('gives the design as the bytes of a binary STL, named after the design, without saving it', async () => {
		const d = deps();
		const out = await exportStlBytes(design('Bracket'), d);
		expect(out.fileName).toBe('Bracket.stl');
		// a binary STL: 80 byte header, a count, 50 bytes a triangle
		const view = new DataView(out.data.buffer, out.data.byteOffset);
		expect(view.getUint32(80, true)).toBe(4);
		expect(out.data.byteLength).toBe(84 + 4 * 50);
		expect(d.save).not.toHaveBeenCalled();
	});

	it('says there is nothing to export when nothing solid is left', async () => {
		await expect(exportStlBytes(design(), deps([]))).rejects.toThrow(/nothing to export/i);
	});
});

describe('onlySelected and support points', () => {
	it('leaves the points out: they are numbered for the whole design, not for a selection', () => {
		const withPoints = setSupportPoints(
			addShape(addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'a' }).design, 'box', [50, 0], { id: 'b' }).design,
			{
				objects: [{ points: [{ x: 0, y: 0, z: 0, radius: 0.4, type: 'island' }] }, { points: [] }],
			},
		);
		expect(withPoints.supports).toBeDefined();
		expect(onlySelected(withPoints, ['b']).supports).toBeUndefined();
	});
});

describe('a part below the workplane', () => {
	const under = (): ExportBody => ({
		name: 'Sunk',
		color: '#f28c28',
		mesh: {
			positions: new Float32Array([0, 0, -5, 10, 0, 0, 0, 10, 0, 0, 0, 10]),
			indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
		},
	});

	it('is noticed only when a corner of a body is below z = 0 (touching the plane is not below)', () => {
		expect(reachesBelowPlane([body()])).toBe(false);
		expect(reachesBelowPlane([body(), under()])).toBe(true);
		expect(reachesBelowPlane([])).toBe(false);
	});

	it('asks nothing when everything is on or above the plane', async () => {
		const ask = vi.fn();
		await runExport(design(), 'stl', { ...deps(), belowPlane: ask });
		expect(ask).not.toHaveBeenCalled();
	});

	it('asks what to do, and "keep" exports the bodies as they are', async () => {
		const d = { ...deps([under()]), belowPlane: vi.fn().mockResolvedValue('keep') };
		await runExport(design(), 'stl', d);
		expect(d.belowPlane).toHaveBeenCalledTimes(1);
		expect(d.bodies).toHaveBeenCalledTimes(1);
		expect(d.save).toHaveBeenCalledTimes(1);
	});

	it('"cut" asks the engine again, with the cut, and exports that', async () => {
		const bodies = vi
			.fn()
			.mockResolvedValueOnce([under()])
			.mockResolvedValueOnce([body('Cut')]);
		const d = { bodies, save: vi.fn(), belowPlane: vi.fn().mockResolvedValue('cut') };
		await runExport(design(), 'obj', d);
		expect(bodies).toHaveBeenNthCalledWith(2, expect.anything(), { cutBelowPlane: true });
		expect(String(d.save.mock.calls[0]![1])).toContain('o Cut');
	});

	it('"cancel" exports nothing and says it was cancelled', async () => {
		const d = { ...deps([under()]), belowPlane: vi.fn().mockResolvedValue('cancel') };
		await expect(runExport(design(), 'stl', d)).rejects.toBeInstanceOf(ExportCancelled);
		expect(d.save).not.toHaveBeenCalled();
	});

	it('says so when cutting leaves nothing to export', async () => {
		const bodies = vi.fn().mockResolvedValueOnce([under()]).mockResolvedValueOnce([]);
		const d = { bodies, save: vi.fn(), belowPlane: vi.fn().mockResolvedValue('cut') };
		await expect(runExport(design(), 'stl', d)).rejects.toThrow(/nothing is left above the workplane/i);
	});

	it('does not ask when the caller has no way to ask (Hollow, Merge), and keeps the bodies', async () => {
		const d = deps([under()]);
		await expect(exportStlBytes(design(), d)).resolves.toBeDefined();
		expect(d.bodies).toHaveBeenCalledTimes(1);
	});
});
