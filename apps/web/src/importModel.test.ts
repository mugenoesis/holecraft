import type { MeshData } from '@holecraft/core';
import { write3mf, writeObj, writeStl } from '@holecraft/geometry';
import { describe, expect, it, vi } from 'vitest';
import { IMPORT_ACCEPT, importModelFile, importModelObjects } from './importModel.ts';

const REF = 'a'.repeat(64);
const tetra = {
	positions: new Float32Array([100, 100, 5, 110, 100, 5, 100, 120, 5, 100, 100, 35]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};
const body = { name: 'x', color: '#ffffff', mesh: tetra };

const file = (name: string, bytes: Uint8Array | string) => {
	const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
	return {
		name,
		size: data.length,
		arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
	};
};
const deps = () => ({ upload: vi.fn(async (_m: MeshData) => REF), extrudeSvg: vi.fn(async (_text: string, _depth: number) => tetra) });

describe('importModelFile', () => {
	it('reads an STL, stores it, and describes the shape to add', async () => {
		const d = deps();
		const { input } = await importModelFile(file('Bracket.stl', writeStl([body])), d);
		expect(input).toEqual({ name: 'Bracket', ref: REF, size: [10, 20, 30] });
		expect(d.upload).toHaveBeenCalledTimes(1);
	});

	it('stores the model fitted to the unit box, however far from the origin it was made', async () => {
		const d = deps();
		const { mesh } = await importModelFile(file('a.stl', writeStl([body])), d);
		expect(Math.max(...mesh.positions)).toBeCloseTo(1);
		expect(Math.min(...mesh.positions)).toBeCloseTo(-0.5);
		expect(d.upload.mock.calls[0]![0]).toBe(mesh);
	});

	it('stands a Y-up model upright when told Y is up: the 10 x 20 x 30 model is 10 x 30 x 20 (its y is the height)', async () => {
		const { input, mesh } = await importModelFile(file('Bracket.obj', writeObj([body])), deps(), { up: 'y' });
		expect(input.size).toEqual([10, 30, 20]);
		expect(Math.min(...Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions[i * 3 + 2]!))).toBeCloseTo(0); // standing on its base
	});

	it('leaves a model as it is when Z is up, which is the default', async () => {
		const [a, b] = [
			await importModelFile(file('a.stl', writeStl([body])), deps(), { up: 'z' }),
			await importModelFile(file('a.stl', writeStl([body])), deps()),
		];
		expect(a.input.size).toEqual([10, 20, 30]);
		expect(b.input.size).toEqual([10, 20, 30]);
	});

	it('turns an SVG into a solid 5 mm deep (the geometry worker does the extruding), named after the file, and stores it', async () => {
		const d = deps();
		const { input } = await importModelFile(file('Logo.svg', '<svg viewBox="0 0 1 1"/>'), d);
		expect(d.extrudeSvg).toHaveBeenCalledWith('<svg viewBox="0 0 1 1"/>', 5);
		expect(input).toMatchObject({ name: 'Logo', ref: REF });
		expect(d.upload).toHaveBeenCalledTimes(1);
	});

	it('does not turn an SVG when the up axis is set to Y: it is already flat on the floor', async () => {
		const { input } = await importModelFile(file('Logo.svg', '<svg/>'), deps(), { up: 'y' });
		expect(input.size).toEqual([10, 20, 30]); // the model the fake extruder gave, as it came
	});

	it('passes on what is wrong with an SVG, and stores nothing', async () => {
		const d = deps();
		d.extrudeSvg.mockRejectedValue(new Error('This SVG has no filled shapes to make a solid from.'));
		await expect(importModelFile(file('x.svg', '<svg/>'), d)).rejects.toThrow('no filled shapes');
		expect(d.upload).not.toHaveBeenCalled();
	});

	it('reads OBJ files too', async () => {
		const { input } = await importModelFile(file('m.obj', writeObj([body])), deps());
		expect(input.size).toEqual([10, 20, 30]);
	});

	it('says what it can read when given something else', async () => {
		await expect(importModelFile(file('notes.txt', 'hi'), deps())).rejects.toThrow(/STL, OBJ, 3MF or SVG/);
	});

	it('says so when a model has no thickness, and stores nothing', async () => {
		const d = deps();
		const flat = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]) };
		await expect(importModelFile(file('flat.stl', writeStl([{ ...body, mesh: flat }])), d)).rejects.toThrow(/flat/i);
		expect(d.upload).not.toHaveBeenCalled();
	});

	it('does not refuse a file of 150 MB, which holds a model of about three million triangles', async () => {
		const big = { name: 'big.stl', size: 150 * 1024 * 1024, arrayBuffer: vi.fn().mockRejectedValue(new Error('read')) };
		await expect(importModelFile(big, deps())).rejects.toThrow('read');
		expect(big.arrayBuffer).toHaveBeenCalled();
	});

	it('refuses very large files before reading them', async () => {
		const big = { name: 'big.stl', size: 201 * 1024 * 1024, arrayBuffer: vi.fn() };
		await expect(importModelFile(big, deps())).rejects.toThrow(/too large/i);
		expect(big.arrayBuffer).not.toHaveBeenCalled();
	});

	it('passes on a failure to store the model', async () => {
		const d = { upload: vi.fn(async () => Promise.reject(new Error('Could not reach the server'))) };
		await expect(importModelFile(file('a.stl', writeStl([body])), d)).rejects.toThrow('Could not reach the server');
	});
});

describe('IMPORT_ACCEPT', () => {
	it('lists the file types the picker should offer', () => {
		expect(IMPORT_ACCEPT).toBe('.stl,.obj,.3mf,.svg');
	});
});

describe('importModelObjects', () => {
	/** A closed cube from (x, y, z) with sides `s`, as a mesh. */
	const cube = (x: number, y: number, z: number, s: number): MeshData => {
		const c = [
			[0, 0, 0],
			[1, 0, 0],
			[1, 1, 0],
			[0, 1, 0],
			[0, 0, 1],
			[1, 0, 1],
			[1, 1, 1],
			[0, 1, 1],
		].map(([a, b, d]) => [x + a! * s, y + b! * s, z + d! * s]);
		const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
		return { positions: new Float32Array(c.flat()), indices: new Uint32Array(faces) };
	};
	const three = () =>
		write3mf([
			{ name: 'Left', color: '#ffffff', mesh: cube(0, 0, 0, 10) },
			{ name: 'Middle', color: '#ffffff', mesh: cube(50, 10, 5, 20) },
			{ name: 'Right', color: '#ffffff', mesh: cube(100, 0, 0, 10) },
		]);

	it('is one item at the middle, on the floor, for an STL, with the size of the model', async () => {
		const d = deps();
		const out = await importModelObjects(file('Bracket.stl', writeStl([body])), d);
		expect(out.items).toHaveLength(1);
		expect(out.items[0]).toMatchObject({ at: [0, 0], lift: 0, input: { name: 'Bracket', ref: REF, size: [10, 20, 30] } });
		expect(out.size).toEqual([10, 20, 30]);
	});

	it('is an item for each object of a 3MF, each fitted and stored on its own', async () => {
		const d = deps();
		const out = await importModelObjects(file('Plate.3mf', three()), d);
		expect(out.items.map((i) => i.input.name)).toEqual(['Left', 'Middle', 'Right']);
		expect(out.items.map((i) => i.input.size)).toEqual([
			[10, 10, 10],
			[20, 20, 20],
			[10, 10, 10],
		]);
		expect(d.upload).toHaveBeenCalledTimes(3);
		for (const i of out.items) expect(Math.min(...i.mesh.positions)).toBeCloseTo(-0.5); // each in its own unit box
	});

	it('keeps the layout: the whole is centred on the plate and stands on it, and each object keeps its own place and height in it', async () => {
		const out = await importModelObjects(file('Plate.3mf', three()), deps());
		// together they span x 0 to 110, y 0 to 30 and z 0 to 25, so the middle is (55, 15) and the base is z 0
		expect(out.items.map((i) => i.at)).toEqual([
			[-50, -10],
			[5, 5],
			[50, -10],
		]);
		expect(out.items.map((i) => i.lift)).toEqual([0, 5, 0]);
		expect(out.size).toEqual([110, 30, 25]);
	});

	it('stands the whole on the plate when the file has it floating, keeping the heights between the objects', async () => {
		const floating = write3mf([
			{ name: 'Low', color: '#ffffff', mesh: cube(0, 0, 100, 10) },
			{ name: 'High', color: '#ffffff', mesh: cube(30, 0, 120, 10) },
		]);
		const out = await importModelObjects(file('Float.3mf', floating), deps());
		expect(out.items.map((i) => i.lift)).toEqual([0, 20]);
	});

	it('uses the Up axis for every object alike', async () => {
		const out = await importModelObjects(file('Plate.3mf', three()), deps(), { up: 'y' });
		// y is the height now: the middle object, 10 to 30 in y, stands 10 mm above the first and last
		expect(out.items.map((i) => i.lift)).toEqual([0, 10, 0]);
		expect(out.size[2]).toBe(30);
	});

	it('names the object that cannot be used, and stores nothing', async () => {
		const d = deps();
		const flat = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]) };
		const zip = write3mf([
			{ name: 'Fine', color: '#ffffff', mesh: cube(0, 0, 0, 10) },
			{ name: 'Sheet', color: '#ffffff', mesh: flat },
		]);
		await expect(importModelObjects(file('Plate.3mf', zip), d)).rejects.toThrow(/Sheet.*flat/i);
		expect(d.upload).not.toHaveBeenCalled();
	});

	it('refuses very large files before reading them, as importModelFile does', async () => {
		const big = { name: 'big.3mf', size: 201 * 1024 * 1024, arrayBuffer: vi.fn() };
		await expect(importModelObjects(big, deps())).rejects.toThrow(/too large/i);
		expect(big.arrayBuffer).not.toHaveBeenCalled();
	});

	it('says what it can read when the file is not a model', async () => {
		await expect(importModelObjects(file('notes.txt', 'hi'), deps())).rejects.toThrow(/STL, OBJ, 3MF or SVG/);
	});

	it('is one item for an SVG, as before', async () => {
		const out = await importModelObjects(file('icon.svg', '<svg/>'), deps());
		expect(out.items).toHaveLength(1);
		expect(out.items[0]?.input.name).toBe('icon');
	});
});
