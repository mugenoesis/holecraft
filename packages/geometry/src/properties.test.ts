import { addShape, createEmptyDesign, type Design, groupNodes, moveNodes, setNodeMode, setShapeSize } from '@holecraft/core';
import fc from 'fast-check';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import type { ExportBody } from './export.ts';
import {
	exportFileName,
	importMeshFile,
	loadManifold,
	MAX_IMPORT_TRIANGLES,
	parse3mf,
	parseObj,
	parseStl,
	readStoredZip,
	readZip,
	weldMesh,
	write3mf,
	writeObj,
	writeStl,
	writeStoredZip,
} from './index.ts';

/*
 * Property-based tests: each states a rule that must hold for every input and lets fast-check try many
 * generated ones. The file readers get random bytes and corrupted real files, because in production they
 * receive whatever a user picks.
 */

const RUNS = { numRuns: 200 };
const FUZZ = { numRuns: 500 };

interface Mesh {
	positions: Float32Array;
	indices: Uint32Array;
}

/** Everything a mesh that comes out of a reader must satisfy. */
function expectValidMesh(m: Mesh): void {
	expect(m.positions.length % 3).toBe(0);
	expect(m.indices.length % 3).toBe(0);
	expect(m.indices.length / 3).toBeLessThanOrEqual(MAX_IMPORT_TRIANGLES);
	expect(m.positions.every(Number.isFinite)).toBe(true);
	const vertices = m.positions.length / 3;
	for (let t = 0; t < m.indices.length; t += 3) {
		const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
		expect(Math.max(a, b, c)).toBeLessThan(vertices);
		expect(a !== b && b !== c && a !== c, 'no degenerate triangle').toBe(true);
	}
}

/** A thrown error that is one the reader meant to throw (an Error with a message for the user), not a crash. */
function expectDeliberate(error: unknown, mentions?: RegExp): void {
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message.length).toBeGreaterThan(0);
	if (mentions) expect((error as Error).message).toMatch(mentions);
}

/** Triangles with whole-number corners (so they survive being stored as 32-bit floats exactly). */
const corner = fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }));
const triangle = fc.tuple(corner, corner, corner);
const aSoup = fc.array(triangle, { minLength: 1, maxLength: 25 });

const asMesh = (soup: ReadonlyArray<ReadonlyArray<readonly number[]>>): Mesh => ({
	positions: Float32Array.from(soup.flat(2)),
	indices: Uint32Array.from({ length: soup.length * 3 }, (_, i) => i),
});

/** The triangles of a mesh as lists of corner coordinates, in order. */
function trianglesOf(m: Mesh): string[] {
	const out: string[] = [];
	for (let t = 0; t < m.indices.length; t += 3) {
		out.push([0, 1, 2].map((k) => [...m.positions.subarray(m.indices[t + k]! * 3, m.indices[t + k]! * 3 + 3)].join(',')).join(' '));
	}
	return out;
}

/** What should survive a round trip: the triangles whose corners are all different places. */
const solidTriangles = (soup: ReadonlyArray<ReadonlyArray<readonly number[]>>): string[] =>
	soup
		.filter(([a, b, c]) => String(a) !== String(b) && String(b) !== String(c) && String(a) !== String(c))
		.map((t) => t.map((p) => p.join(',')).join(' '));

const aBody = (name = 'Body'): fc.Arbitrary<ExportBody> => aSoup.map((soup) => ({ name, color: '#f28c28', mesh: asMesh(soup) }));

// ---------------------------------------------------------------- readers get hostile input

describe('reading STL files', () => {
	it('random bytes are refused with a clear error, or read as a valid mesh', () => {
		fc.assert(
			fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
				try {
					expectValidMesh(parseStl(bytes));
				} catch (error) {
					expectDeliberate(error, /STL/);
				}
			}),
			FUZZ,
		);
	});

	it('a binary STL with a header and any triangle count and floats (NaN, infinity, huge) is refused or valid', () => {
		const record = fc.tuple(
			fc.nat(30),
			fc.array(fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, -0, 1e38)), { minLength: 0, maxLength: 120 }),
		);
		fc.assert(
			fc.property(record, ([declared, floats]) => {
				const bytes = new Uint8Array(84 + floats.length * 4);
				const view = new DataView(bytes.buffer);
				view.setUint32(80, declared, true);
				for (const [i, v] of floats.entries()) view.setFloat32(84 + i * 4, v, true);
				try {
					expectValidMesh(parseStl(bytes));
				} catch (error) {
					expectDeliberate(error, /STL/);
				}
			}),
			FUZZ,
		);
	});

	it('text that begins like an STL is refused or valid, whatever follows', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 300 }), (rest) => {
				try {
					expectValidMesh(parseStl(new TextEncoder().encode(`solid x\n${rest}`)));
				} catch (error) {
					expectDeliberate(error, /STL/);
				}
			}),
			FUZZ,
		);
	});

	it('a real file with any single byte changed is refused or still valid', () => {
		fc.assert(
			fc.property(aBody(), fc.nat(), fc.integer({ min: 0, max: 255 }), (body, at, byte) => {
				const bytes = writeStl([body]);
				bytes[at % bytes.length] = byte;
				try {
					expectValidMesh(parseStl(bytes));
				} catch (error) {
					expectDeliberate(error, /STL/);
				}
			}),
			FUZZ,
		);
	});

	it('writing then reading keeps every real triangle, in order, and drops only collapsed ones', () => {
		fc.assert(
			fc.property(aSoup, (soup) => {
				const wanted = solidTriangles(soup);
				if (wanted.length === 0) return;
				expect(trianglesOf(parseStl(writeStl([{ name: 'x', color: '#ffffff', mesh: asMesh(soup) }])))).toEqual(wanted);
			}),
			RUNS,
		);
	});
});

describe('reading OBJ files', () => {
	it('random text is refused with a clear error, or read as a valid mesh', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 400 }), (text) => {
				try {
					expectValidMesh(parseObj(text));
				} catch (error) {
					expectDeliberate(error, /OBJ/);
				}
			}),
			FUZZ,
		);
	});

	it('lines shaped like vertices and faces, with odd numbers and references, are refused or valid', () => {
		const number = fc.oneof(
			fc.double({ noNaN: false }),
			fc.integer({ min: -5, max: 8 }),
			fc.constantFrom('nan', 'inf', '1e999', '-', '1/2/3', '0'),
		);
		const line = fc.oneof(
			fc.tuple(fc.constant('v'), number, number, number).map((p) => p.join(' ')),
			fc
				.tuple(fc.constant('f'), fc.array(fc.oneof(number, fc.constantFrom('1/1/1', '2//2', '-1', '0')), { minLength: 0, maxLength: 6 }))
				.map(([f, ns]) => [f, ...ns].join(' ')),
			fc.constantFrom('', '# comment', 'o part', 'vn 0 0 1', 'usemtl a'),
		);
		fc.assert(
			fc.property(fc.array(line, { maxLength: 30 }), (lines) => {
				try {
					expectValidMesh(parseObj(lines.join('\n')));
				} catch (error) {
					expectDeliberate(error, /OBJ/);
				}
			}),
			{ numRuns: 1000 },
		);
	});

	it('writing then reading keeps every real triangle, in order', () => {
		fc.assert(
			fc.property(aSoup, (soup) => {
				const wanted = solidTriangles(soup);
				if (wanted.length === 0) return;
				expect(trianglesOf(parseObj(writeObj([{ name: 'x', color: '#ffffff', mesh: asMesh(soup) }])))).toEqual(wanted);
			}),
			RUNS,
		);
	});
});

describe('reading 3MF and zip files', () => {
	it('random bytes are never read as a zip, and always refused with an Error', async () => {
		await fc.assert(
			fc.asyncProperty(fc.uint8Array({ maxLength: 300 }), async (bytes) => {
				await expect(readZip(bytes)).rejects.toBeInstanceOf(Error);
				await expect(parse3mf(bytes)).rejects.toBeInstanceOf(Error);
			}),
			FUZZ,
		);
	});

	it('a real 3MF with any single byte changed is refused or still a valid mesh (checksums catch damage)', async () => {
		await fc.assert(
			fc.asyncProperty(aBody(), fc.nat(), fc.integer({ min: 0, max: 255 }), async (body, at, byte) => {
				const bytes = write3mf([body]);
				bytes[at % bytes.length] = byte;
				try {
					expectValidMesh(await parse3mf(bytes));
				} catch (error) {
					expectDeliberate(error);
				}
			}),
			{ numRuns: 300 },
		);
	});

	it('writing then reading keeps every real triangle of every body, in order', async () => {
		await fc.assert(
			fc.asyncProperty(fc.array(aSoup, { minLength: 1, maxLength: 3 }), async (soups) => {
				const bodies = soups.map((soup, i) => ({ name: `Body ${i}`, color: '#f28c28', mesh: asMesh(soup) }));
				const wanted = soups.flatMap(solidTriangles);
				if (wanted.length === 0) return;
				expect(trianglesOf(await parse3mf(write3mf(bodies)))).toEqual(wanted);
			}),
			{ numRuns: 100 },
		);
	});

	it('a zip written then read gives the same files back, and any damaged byte of a file is caught by its checksum', () => {
		const entry = fc.record({ data: fc.uint8Array({ minLength: 1, maxLength: 60 }) });
		fc.assert(
			fc.property(fc.array(entry, { minLength: 1, maxLength: 4 }), fc.nat(), fc.integer({ min: 1, max: 255 }), (entries, at, change) => {
				const files = entries.map((e, i) => ({ name: `dir/file${i}.bin`, data: e.data }));
				const zip = writeStoredZip(files);
				const back = readStoredZip(zip);
				for (const f of files) expect([...back.get(f.name)!]).toEqual([...f.data]);

				// damage one byte inside one file's data
				const victim = at % files.length;
				let offset = 0;
				for (const [i, f] of files.entries()) {
					const header = 30 + new TextEncoder().encode(f.name).length;
					if (i === victim) {
						const damaged = Uint8Array.from(zip);
						const inside = offset + header + (at % f.data.length);
						damaged[inside] = damaged[inside]! ^ change;
						expect(() => readStoredZip(damaged)).toThrow(/checksum/i);
					}
					offset += header + f.data.length;
				}
			}),
			RUNS,
		);
	});
});

describe('importing any file', () => {
	it('a file of any name and contents is refused with an Error or becomes a valid named mesh', async () => {
		await fc.assert(
			fc.asyncProperty(fc.string({ maxLength: 30 }), fc.uint8Array({ maxLength: 200 }), async (name, bytes) => {
				try {
					const m = await importMeshFile(name, bytes);
					expectValidMesh(m);
					expect(m.name.length).toBeGreaterThan(0);
				} catch (error) {
					expectDeliberate(error);
				}
			}),
			FUZZ,
		);
	});
});

// ---------------------------------------------------------------- welding

describe('welding a mesh', () => {
	const aRawMesh = fc.tuple(fc.array(corner, { minLength: 3, maxLength: 12 }), fc.nat()).chain(([corners]) =>
		fc
			.array(fc.tuple(fc.nat(corners.length - 1), fc.nat(corners.length - 1), fc.nat(corners.length - 1)), { minLength: 1, maxLength: 20 })
			.map((tris) => ({
				positions: Float32Array.from(corners.flat()),
				indices: Uint32Array.from(tris.flat()),
			})),
	);

	it('gives a valid mesh with no two corners in the same place', () => {
		fc.assert(
			fc.property(aRawMesh, (m) => {
				const w = weldMesh(m.positions, m.indices);
				expectValidMesh(w);
				const places = new Set<string>();
				for (let i = 0; i < w.positions.length; i += 3) places.add(`${w.positions[i]},${w.positions[i + 1]},${w.positions[i + 2]}`);
				expect(places.size).toBe(w.positions.length / 3);
			}),
			RUNS,
		);
	});

	it('welding a welded mesh changes nothing', () => {
		fc.assert(
			fc.property(aRawMesh, (m) => {
				const once = weldMesh(m.positions, m.indices);
				const twice = weldMesh(once.positions, once.indices);
				expect([...twice.positions]).toEqual([...once.positions]);
				expect([...twice.indices]).toEqual([...once.indices]);
			}),
			RUNS,
		);
	});

	it('keeps exactly the triangles whose corners are all different places', () => {
		fc.assert(
			fc.property(aRawMesh, (m) => {
				const before = trianglesOf(m).filter((t) => new Set(t.split(' ')).size === 3);
				expect(trianglesOf(weldMesh(m.positions, m.indices))).toEqual(before);
			}),
			RUNS,
		);
	});
});

// ---------------------------------------------------------------- file names

describe('export file names', () => {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the test is that no control character survives
	const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
	const RESERVED = /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\..*)?$/i;

	it('are always safe on every file system, whatever the design is called', () => {
		fc.assert(
			fc.property(
				fc.oneof(
					fc.string({ maxLength: 400 }),
					fc.string({ unit: 'grapheme', maxLength: 100 }),
					fc.constantFrom('', ' ', '.', '..', 'CON', 'con.txt', 'NUL', 'a/b', '\\\\server\\share', 'x'.repeat(1000)),
				),
				fc.constantFrom('stl', 'obj', '3mf'),
				(name, ext) => {
					const file = exportFileName(name, ext);
					expect(file.endsWith(`.${ext}`)).toBe(true);
					const base = file.slice(0, -(ext.length + 1));
					expect(base.length).toBeGreaterThan(0);
					expect(FORBIDDEN.test(file)).toBe(false);
					expect(RESERVED.test(base)).toBe(false);
					expect(/[ .]$/.test(base)).toBe(false);
					expect(/^\s/.test(file)).toBe(false);
					expect(new TextEncoder().encode(file).length).toBeLessThanOrEqual(255);
				},
			),
			{ numRuns: 1000 },
		);
	});
});

// ---------------------------------------------------------------- the cutting engine

describe('cutting with the real manifold engine', () => {
	let M: ManifoldToplevel;
	beforeAll(async () => {
		M = await loadManifold();
	});

	const volume = (m: Mesh): number => {
		const p = m.positions;
		let sum = 0;
		for (let i = 0; i < m.indices.length; i += 3) {
			const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
			sum +=
				(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
					p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
					p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
				6;
		}
		return sum;
	};

	/** Boxes (so volumes are exact) of random size at random places, all in one group. */
	const aBoxes = fc.array(
		fc.record({
			w: fc.integer({ min: 2, max: 40 }),
			d: fc.integer({ min: 2, max: 40 }),
			h: fc.integer({ min: 2, max: 40 }),
			x: fc.integer({ min: -30, max: 30 }),
			y: fc.integer({ min: -30, max: 30 }),
		}),
		{ minLength: 2, maxLength: 4 },
	);

	function build(
		boxes: Array<{ w: number; d: number; h: number; x: number; y: number }>,
		holes: Set<number>,
	): { design: Design; solid: number } {
		let d = createEmptyDesign('d');
		const ids: string[] = [];
		for (const [i, b] of boxes.entries()) {
			const added = addShape(d, 'box', [0, 0], { id: `b${i}` });
			d = setShapeSize(added.design, added.id, { width: b.w, depth: b.d, height: b.h });
			d = moveNodes(d, [added.id], [b.x, b.y, 0]);
			if (holes.has(i)) d = setNodeMode(d, [added.id], 'hole');
			ids.push(added.id);
		}
		return {
			design: groupNodes(d, ids, { id: 'g' }).design,
			solid: boxes.filter((_, i) => !holes.has(i)).reduce((sum, b) => sum + b.w * b.d * b.h, 0),
		};
	}

	it('joined solids are never bigger than their parts added together, nor smaller than the biggest part', () => {
		fc.assert(
			fc.property(aBoxes, (boxes) => {
				const { design, solid } = build(boxes, new Set());
				const mesh = evaluateGroup(M, design, 'g')!;
				expect(volume(mesh)).toBeLessThanOrEqual(solid + 1e-6);
				expect(volume(mesh)).toBeGreaterThanOrEqual(Math.max(...boxes.map((b) => b.w * b.d * b.h)) - 1e-6);
			}),
			{ numRuns: 60 },
		);
	});

	it('a hole never adds material, and a result is always a closed, outward-facing solid', () => {
		fc.assert(
			fc.property(aBoxes, (boxes) => {
				const solidOnly = evaluateGroup(M, build(boxes, new Set()).design, 'g')!;
				const holed = evaluateGroup(M, build(boxes, new Set([boxes.length - 1])).design, 'g');
				if (holed) {
					expect(volume(holed)).toBeLessThanOrEqual(volume(solidOnly) + 1e-6);
					expect(volume(holed)).toBeGreaterThan(0);
				}
			}),
			{ numRuns: 60 },
		);
	});

	it('a hole far away from everything changes nothing', () => {
		fc.assert(
			fc.property(aBoxes, (boxes) => {
				const withoutHole = evaluateGroup(M, build(boxes, new Set()).design, 'g')!;

				// the same boxes plus one more, made a hole and moved 500 mm away from everything
				const far = [...boxes, { w: 10, d: 10, h: 10, x: 0, y: 0 }];
				const holeId = `b${far.length - 1}`;
				const { design } = build(far, new Set([far.length - 1]));
				const hole = design.nodes[holeId]!;
				const away: Design = {
					...design,
					nodes: { ...design.nodes, [holeId]: { ...hole, transform: hole.transform.map((v, i) => (i === 12 ? 500 : v)) } },
				};
				expect(volume(evaluateGroup(M, away, 'g')!)).toBeCloseTo(volume(withoutHole), 6);
			}),
			{ numRuns: 40 },
		);
	});
});
