import type { MeshShapeInput } from '@holecraft/core';
import type { ClosedCavity, GroupMesh } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { joinFills, runFill } from './cavityFill.ts';

/** A closed tetrahedron from (x, 0, 5) to (x + 4, 4, 9). */
const tetra = (x: number): GroupMesh => ({
	positions: new Float32Array([x, 0, 5, x + 4, 0, 5, x, 4, 5, x, 0, 9]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
});
const cavity = (id: number, x: number): ClosedCavity => ({ id, layer: 0, z: 5.25, areaMm2: 30, fill: tetra(x) });
const input: MeshShapeInput = { name: 'x', ref: 'f'.repeat(64), size: [4, 4, 4] };
const stored = { input, mesh: { positions: new Float32Array(), indices: new Uint32Array() } };

describe('joinFills', () => {
	it('puts the fills in one mesh, each keeping its own corners', () => {
		const joined = joinFills([cavity(0, 0), cavity(1, 10)]);
		expect(joined.positions).toHaveLength(24);
		expect(Array.from(joined.indices.slice(12, 15))).toEqual([4, 6, 5]);
	});
});

describe('runFill', () => {
	it('stores the fill as an imported model, named for the cavity, with the box it fills in the world', async () => {
		const read = vi.fn().mockResolvedValue(stored);
		const out = await runFill([cavity(2, 3)], { read });
		expect(out.error).toBeNull();
		expect(out.input).toEqual({ ...input, name: 'Cavity 3 fill' });
		expect(out.bounds).toEqual({ min: [3, 0, 5], max: [7, 4, 9] });
		const file = read.mock.calls[0]![0] as { size: number };
		expect(file.size).toBe(84 + 4 * 50);
	});

	it('names the fill of several cavities together, and covers all of them', async () => {
		const out = await runFill([cavity(0, 0), cavity(1, 10)], { read: async () => stored });
		expect(out.input?.name).toBe('Cavity fill');
		expect(out.bounds).toEqual({ min: [0, 0, 5], max: [14, 4, 9] });
	});

	it('says what went wrong, in words, when the fill cannot be read', async () => {
		const out = await runFill([cavity(0, 0)], { read: async () => Promise.reject(new Error('not a model')) });
		expect(out).toEqual({ error: 'not a model', input: null, bounds: null });
		const odd = await runFill([cavity(0, 0)], { read: async () => Promise.reject('boom') });
		expect(odd.error).toBe('The cavity could not be filled');
	});

	it('has nothing to fill without cavities', async () => {
		expect((await runFill([], { read: vi.fn() })).error).toBe('There is no cavity to fill');
	});
});
