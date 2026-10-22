import type { MeshShapeInput } from '@holecraft/core';
import type { GroupMesh } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { type EngraveRequest, runEngrave } from './engraveJob.ts';

const request: EngraveRequest = {
	targetId: 't',
	frame: { origin: [0, 0, 20], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
	polygons: [
		[
			[-5, -2],
			[5, -2],
			[5, 2],
			[-5, 2],
		],
	],
	settings: { text: 'Hi', font: 1, em: 10, angle: 0, at: [0, 0], depth: 3, mode: 'engrave' },
	depth: 3,
	mode: 'engrave',
	resolution: 0.5,
	name: 'Engraving "Hi"',
};

/** A closed tetrahedron from (-5,-2,17) to (5,2,20.5): enough to measure and to write as an STL. */
const mesh: GroupMesh = {
	positions: new Float32Array([-5, -2, 17, 5, -2, 17, 0, 2, 17, 0, 0, 20.5]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
};
const input: MeshShapeInput = { name: 'x', ref: 'e'.repeat(64), size: [10, 4, 3.5] };

describe('runEngrave', () => {
	it('fits the lettering, reads it back as an imported model, and gives its name, its place in the world and the model to store', async () => {
		const fit = vi.fn().mockResolvedValue(mesh);
		const read = vi.fn().mockResolvedValue({ input, mesh: { positions: new Float32Array(), indices: new Uint32Array() } });
		const out = await runEngrave(request, { fit, read });
		expect(fit).toHaveBeenCalledWith(request);
		expect(out.error).toBeNull();
		expect(out.input).toEqual({ ...input, name: 'Engraving "Hi"' });
		expect(out.bounds).toEqual({ min: [-5, -2, 17], max: [5, 2, 20.5] });
	});

	it('hands the importer the lettering as a binary STL file with the right number of triangles', async () => {
		const read = vi.fn().mockResolvedValue({ input, mesh });
		await runEngrave(request, { fit: async () => mesh, read });
		const file = read.mock.calls[0]![0] as { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };
		expect(file.name).toBe('engraving.stl');
		const bytes = new DataView(await file.arrayBuffer());
		expect(bytes.getUint32(80, true)).toBe(4);
		expect(file.size).toBe(84 + 4 * 50);
	});

	it('says what went wrong, in words, and gives no model, when the fitting fails or the lettering cannot be read', async () => {
		const failed = await runEngrave(request, {
			fit: async () => Promise.reject(new Error('Part of the lettering is past the edge')),
			read: vi.fn(),
		});
		expect(failed).toEqual({ error: 'Part of the lettering is past the edge', input: null, bounds: null });
		const unread = await runEngrave(request, { fit: async () => mesh, read: async () => Promise.reject(new Error('not a model')) });
		expect(unread.error).toBe('not a model');
		const odd = await runEngrave(request, { fit: async () => Promise.reject('boom'), read: vi.fn() });
		expect(odd.error).toMatch(/could not be engraved/i);
	});
});

describe('runEngrave into a group', () => {
	it('brings the fitted lettering into the group’s own frame, and gives its box there', async () => {
		const read = vi.fn().mockResolvedValue({ input, mesh });
		// a group standing 100 mm along x: the way back into it is a move of -100
		const into = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -100, 0, 0, 1];
		const out = await runEngrave(
			{ ...request, into },
			{ fit: async () => ({ ...mesh, positions: mesh.positions.map((v, i) => (i % 3 === 0 ? v + 100 : v)) }), read },
		);
		expect(out.bounds).toEqual({ min: [-5, -2, 17], max: [5, 2, 20.5] });
	});
});
