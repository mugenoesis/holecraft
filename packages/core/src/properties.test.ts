import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, MAX_NAME_LENGTH } from './design.ts';
import { moveNodes, setNodeColor, setNodeEuler, setNodeMode, setShapeSize } from './edit.ts';
import { clampToWorkplane, SNAP_STEPS_MM, snapToGrid } from './grid.ts';
import { groupNodes, ungroupNodes } from './groups.ts';
import { decodeMesh, encodeMesh, normalizeMesh, signedVolume } from './meshShape.ts';
import { addShape } from './ops.ts';
import { addPaletteColor, MAX_PALETTE_SIZE, paletteSlotOf, removePaletteColor, setPaletteColor } from './palette.ts';
import { composeTransform, eulerToMatrix, matrixToEuler, multiplyMat3, rotateAboutWorldAxis, rotationOfTransform } from './rotation.ts';
import { DesignValidationError, parseDesign } from './validate.ts';

/*
 * Property-based tests: instead of a few hand-picked examples, each test states a rule that must hold for
 * every input and lets fast-check try hundreds of generated ones (and shrink any failure to a small case).
 */

const RUNS = { numRuns: 200 };

// ---------------------------------------------------------------- generating designs

const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);
const size = fc.integer({ min: 1, max: 400 });
const coord = fc.integer({ min: -500, max: 500 });

type Step =
	| { kind: 'add'; shape: 'box' | 'cylinder' | 'sphere'; x: number; y: number }
	| { kind: 'group'; picks: number[] }
	| { kind: 'ungroup'; pick: number }
	| { kind: 'hole'; pick: number }
	| { kind: 'colour'; pick: number; color: string }
	| { kind: 'move'; pick: number; dx: number; dy: number }
	| { kind: 'size'; pick: number; w: number; d: number; h: number }
	| { kind: 'turn'; pick: number; rx: number; ry: number; rz: number };

const step: fc.Arbitrary<Step> = fc.oneof(
	fc.record({ kind: fc.constant('add' as const), shape: fc.constantFrom('box', 'cylinder', 'sphere'), x: coord, y: coord }),
	fc.record({ kind: fc.constant('group' as const), picks: fc.array(fc.nat(50), { minLength: 2, maxLength: 5 }) }),
	fc.record({ kind: fc.constant('ungroup' as const), pick: fc.nat(50) }),
	fc.record({ kind: fc.constant('hole' as const), pick: fc.nat(50) }),
	fc.record({ kind: fc.constant('colour' as const), pick: fc.nat(50), color: hex }),
	fc.record({ kind: fc.constant('move' as const), pick: fc.nat(50), dx: coord, dy: coord }),
	fc.record({ kind: fc.constant('size' as const), pick: fc.nat(50), w: size, d: size, h: size }),
	fc.record({
		kind: fc.constant('turn' as const),
		pick: fc.nat(50),
		rx: fc.integer({ min: -180, max: 180 }),
		ry: fc.integer({ min: -89, max: 89 }),
		rz: fc.integer({ min: -180, max: 180 }),
	}),
);

function apply(design: Design, s: Step): Design {
	const roots = design.roots;
	const at = (n: number) => roots[n % Math.max(1, roots.length)];
	switch (s.kind) {
		case 'add':
			return addShape(design, s.shape, [s.x, s.y]).design;
		case 'group':
			return groupNodes(
				design,
				[...new Set(s.picks.map(at))].filter((id): id is string => id !== undefined),
			).design;
		case 'ungroup':
			return at(s.pick) ? ungroupNodes(design, [at(s.pick)!]).design : design;
		case 'hole':
			return at(s.pick) ? setNodeMode(design, [at(s.pick)!], 'hole') : design;
		case 'colour':
			return at(s.pick) ? setNodeColor(design, [at(s.pick)!], s.color) : design;
		case 'move':
			return at(s.pick) ? moveNodes(design, [at(s.pick)!], [s.dx, s.dy, 0]) : design;
		case 'size':
			return at(s.pick) ? setShapeSize(design, at(s.pick)!, { width: s.w, depth: s.d, height: s.h }) : design;
		case 'turn':
			return at(s.pick) ? setNodeEuler(design, at(s.pick)!, [s.rx, s.ry, s.rz]) : design;
	}
}

/** A design built by a random series of the editor's own operations. */
const aDesign = fc.array(step, { maxLength: 25 }).map((steps) => steps.reduce(apply, createEmptyDesign('d', 'Generated')));

const wire = (d: Design): unknown => JSON.parse(JSON.stringify(d));

type Key = string | number;

/** Every path to a value inside some JSON (the root excluded), outermost first. */
function pathsIn(value: unknown, path: Key[] = []): Key[][] {
	const own = path.length > 0 ? [path] : [];
	if (Array.isArray(value)) return [...own, ...value.flatMap((v, i) => pathsIn(v, [...path, i]))];
	if (value && typeof value === 'object') return [...own, ...Object.entries(value).flatMap(([k, v]) => pathsIn(v, [...path, k]))];
	return own;
}

/** A copy of `json` with the value at `path` replaced. */
function replaceAt(json: unknown, path: Key[], replacement: unknown): unknown {
	if (path.length === 0) return replacement;
	const [key, ...rest] = path;
	if (Array.isArray(json)) return json.map((v, i) => (i === key ? replaceAt(v, rest, replacement) : v));
	if (json && typeof json === 'object') {
		return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, k === key ? replaceAt(v, rest, replacement) : v]));
	}
	return json;
}

/** The JSON with one value (picked by `pick`) swapped for `replacement`. */
function withOneValueReplaced(json: unknown, pick: number, replacement: unknown): unknown {
	const paths = pathsIn(json);
	const target = paths[pick % Math.max(1, paths.length)];
	return target ? replaceAt(json, target, replacement) : json;
}

/**
 * Values that tend to break validation: just over or under a limit, zero, negative, huge, tiny, and the wrong
 * type. Random JSON almost never lands on these exactly, so they are mixed in on purpose.
 */
const nastyValue = fc.oneof(
	fc.constantFrom(0, -1, 1, 0.5, 999, 1000, 1001, 1e4, 1e6, 1e9, 1e15, 1e308, -1e308, 5e-324, 2 ** 53, -(2 ** 53), 16, 17, 5000, 5001),
	fc.constantFrom('', ' ', '#', '#12345', '#GGGGGG', 'mesh', '__proto__', 'constructor', 'x'.repeat(5000)),
	fc.constantFrom(null, true, false, [], {}, [null], { a: 1 }),
);

// ---------------------------------------------------------------- the rules a good design always obeys

/** Everything parseDesign promises about a design it accepts. */
function expectWellFormed(d: Design): void {
	expect(Object.keys(d.nodes).length).toBeLessThanOrEqual(5000);
	expect(d.palette.length).toBeGreaterThanOrEqual(1);
	expect(d.palette.length).toBeLessThanOrEqual(MAX_PALETTE_SIZE);
	expect(new Set(d.palette).size).toBe(d.palette.length);
	expect(d.name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH * 4);

	const seen = new Set<string>();
	const visit = (id: string): void => {
		const node = d.nodes[id];
		expect(node, `node ${id} exists`).toBeDefined();
		expect(seen.has(id), `node ${id} used once`).toBe(false);
		seen.add(id);
		expect(node!.id).toBe(id);
		expect(node!.transform).toHaveLength(16);
		expect(node!.transform.every(Number.isFinite)).toBe(true);
		expect(node!.color).toMatch(/^#[0-9a-f]{6}$/);
		if (node!.kind === 'group') for (const child of node!.children) visit(child);
		if (node!.kind === 'shape') {
			const { width, depth, height } = node!.params as Record<string, number>;
			for (const v of [width, depth, height]) expect(v! > 0 && v! <= 1000).toBe(true);
		}
	};
	for (const root of d.roots) visit(root);
	expect(seen.size).toBe(Object.keys(d.nodes).length); // nothing left over that no root reaches
}

describe('designs', () => {
	it('every design the editor can build is well formed', () => {
		fc.assert(
			fc.property(aDesign, (d) => expectWellFormed(parseDesign(wire(d)))),
			RUNS,
		);
	});

	it('saving and loading a design changes nothing', () => {
		fc.assert(
			fc.property(aDesign, (d) => {
				const loaded = parseDesign(wire(d));
				expect(loaded).toEqual(wire(d)); // same content (-0 and key order aside, which JSON normalises)
			}),
			RUNS,
		);
	});

	it('loading what was loaded gives the same design again (parsing is stable)', () => {
		fc.assert(
			fc.property(aDesign, (d) => {
				const once = parseDesign(wire(d));
				expect(parseDesign(wire(once))).toEqual(wire(once));
			}),
			RUNS,
		);
	});

	it('arbitrary JSON is either refused with a validation error or never mistaken for a design', () => {
		fc.assert(
			fc.property(fc.jsonValue(), (junk) => {
				try {
					expectWellFormed(parseDesign(junk));
				} catch (error) {
					expect(error).toBeInstanceOf(DesignValidationError);
				}
			}),
			{ numRuns: 500 },
		);
	});

	it('a good design with one value replaced by anything is refused cleanly or still well formed, never a crash', () => {
		const corrupted = fc
			.tuple(aDesign, fc.nat(), fc.oneof({ weight: 1, arbitrary: fc.jsonValue() }, { weight: 4, arbitrary: nastyValue }))
			.filter(([d]) => d.roots.length > 0)
			.map(([d, pick, replacement]) => withOneValueReplaced(wire(d), pick, replacement));
		fc.assert(
			fc.property(corrupted, (json) => {
				try {
					expectWellFormed(parseDesign(json));
				} catch (error) {
					expect(error).toBeInstanceOf(DesignValidationError);
				}
			}),
			{ numRuns: 2000 },
		);
	});
});

describe('grouping', () => {
	it('grouping and ungrouping never moves anything', () => {
		fc.assert(
			fc.property(aDesign, fc.array(fc.nat(50), { minLength: 2, maxLength: 5 }), (d, picks) => {
				const ids = [...new Set(picks.map((n) => d.roots[n % Math.max(1, d.roots.length)]))].filter((id): id is string => id !== undefined);
				const grouped = groupNodes(d, ids);
				if (!grouped.id) return; // nothing to group
				const freed = ungroupNodes(grouped.design, [grouped.id]);
				for (const id of ids) {
					const before = d.nodes[id]!;
					const after = freed.design.nodes[id]!;
					for (let i = 0; i < 16; i++) expect(after.transform[i]).toBeCloseTo(before.transform[i]!, 6);
				}
			}),
			RUNS,
		);
	});
});

// ---------------------------------------------------------------- the palette

const aPalette = fc.uniqueArray(hex, { minLength: 1, maxLength: MAX_PALETTE_SIZE });
const withPalette = (palette: string[]): Design => ({ ...createEmptyDesign('d'), palette });

describe('the palette', () => {
	it('a colour always prints with a filament that exists, and an exact colour with its own', () => {
		fc.assert(
			fc.property(aPalette, hex, (palette, colour) => {
				const slot = paletteSlotOf(palette, colour);
				expect(slot).toBeGreaterThanOrEqual(1);
				expect(slot).toBeLessThanOrEqual(palette.length);
				for (const [i, c] of palette.entries()) expect(paletteSlotOf(palette, c)).toBe(i + 1);
			}),
			RUNS,
		);
	});

	it('the slot chosen is never farther away than any other', () => {
		const distance = (a: string, b: string) =>
			[1, 3, 5].reduce((sum, k) => sum + (Number.parseInt(a.slice(k, k + 2), 16) - Number.parseInt(b.slice(k, k + 2), 16)) ** 2, 0);
		fc.assert(
			fc.property(aPalette, hex, (palette, colour) => {
				const chosen = palette[paletteSlotOf(palette, colour) - 1]!;
				for (const other of palette) expect(distance(colour, chosen)).toBeLessThanOrEqual(distance(colour, other));
			}),
			RUNS,
		);
	});

	it('adding, changing and removing colours never breaks the palette', () => {
		const edit = fc.oneof(
			fc.record({ k: fc.constant('add' as const), color: hex }),
			fc.record({ k: fc.constant('set' as const), slot: fc.integer({ min: -2, max: 20 }), color: hex }),
			fc.record({ k: fc.constant('remove' as const), slot: fc.integer({ min: -2, max: 20 }) }),
		);
		fc.assert(
			fc.property(aPalette, fc.array(edit, { maxLength: 30 }), (palette, edits) => {
				let d = withPalette(palette);
				for (const e of edits) {
					d =
						e.k === 'add'
							? addPaletteColor(d, e.color)
							: e.k === 'set'
								? setPaletteColor(d, e.slot, e.color)
								: removePaletteColor(d, e.slot);
					expect(d.palette.length).toBeGreaterThanOrEqual(1);
					expect(d.palette.length).toBeLessThanOrEqual(MAX_PALETTE_SIZE);
					expect(new Set(d.palette).size).toBe(d.palette.length);
				}
			}),
			RUNS,
		);
	});

	it('changing a colour keeps every shape in step with its slot, and touches no other colour', () => {
		fc.assert(
			fc.property(aDesign, fc.nat(3), hex, (d, slot, colour) => {
				const before = d.palette[slot]!;
				const after = setPaletteColor(d, slot, colour);
				for (const [id, node] of Object.entries(d.nodes)) {
					const changed = after.nodes[id]!.color;
					if (after === d) expect(changed).toBe(node.color);
					else expect(changed).toBe(node.color === before ? colour.toLowerCase() : node.color);
				}
			}),
			RUNS,
		);
	});
});

// ---------------------------------------------------------------- maths

const angle = fc.double({ min: -Math.PI, max: Math.PI, noNaN: true });
/** A 3x3 matrix flipped across its diagonal (for a rotation, its inverse). */
const transposed = (r: readonly number[]): number[] => [r[0]!, r[3]!, r[6]!, r[1]!, r[4]!, r[7]!, r[2]!, r[5]!, r[8]!];
const near = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

describe('rotation maths', () => {
	it('a rotation matrix is orthonormal with determinant 1', () => {
		fc.assert(
			fc.property(angle, angle, angle, (x, y, z) => {
				const r = eulerToMatrix([x, y, z]);
				const rt = transposed(r);
				expect(near(multiplyMat3(r, rt), [1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(true);
				const det =
					r[0]! * (r[4]! * r[8]! - r[5]! * r[7]!) - r[1]! * (r[3]! * r[8]! - r[5]! * r[6]!) + r[2]! * (r[3]! * r[7]! - r[4]! * r[6]!);
				expect(det).toBeCloseTo(1, 9);
			}),
			RUNS,
		);
	});

	it('turning a matrix into angles and back gives the same orientation, even at the poles', () => {
		const pole = fc.constantFrom(Math.PI / 2, -Math.PI / 2);
		fc.assert(
			fc.property(angle, fc.oneof(angle, pole), angle, (x, y, z) => {
				const r = eulerToMatrix([x, y, z]);
				expect(near(eulerToMatrix(matrixToEuler(r)), r, 1e-6)).toBe(true);
			}),
			{ numRuns: 400 },
		);
	});

	it('turning about a world axis keeps the matrix a rotation', () => {
		fc.assert(
			fc.property(angle, angle, angle, fc.constantFrom('x' as const, 'y' as const, 'z' as const), angle, (x, y, z, axis, by) => {
				const r = rotateAboutWorldAxis(eulerToMatrix([x, y, z]), axis, by);
				const rt = transposed(r);
				expect(near(multiplyMat3(r, rt), [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-9)).toBe(true);
			}),
			RUNS,
		);
	});

	it('a transform keeps the rotation it was built from', () => {
		fc.assert(
			fc.property(angle, angle, angle, coord, coord, coord, (x, y, z, px, py, pz) => {
				const r = eulerToMatrix([x, y, z]);
				expect(near(rotationOfTransform(composeTransform([px, py, pz], r)), r)).toBe(true);
			}),
			RUNS,
		);
	});
});

describe('the grid', () => {
	const step = fc.constantFrom(...SNAP_STEPS_MM.filter((s) => s > 0));
	const value = fc.double({ min: -2000, max: 2000, noNaN: true });

	it('snapping lands on the grid, no more than half a step away, and snapping again changes nothing', () => {
		fc.assert(
			fc.property(value, step, (v, s) => {
				const snapped = snapToGrid(v, s);
				expect(Math.abs(snapped - v)).toBeLessThanOrEqual(s / 2 + 1e-9);
				expect(Math.abs(snapped / s - Math.round(snapped / s))).toBeLessThan(1e-9);
				expect(snapToGrid(snapped, s)).toBeCloseTo(snapped, 9);
			}),
			RUNS,
		);
	});

	it('a step of zero leaves a value alone', () => {
		fc.assert(
			fc.property(value, (v) => {
				expect(snapToGrid(v, 0)).toBe(v);
			}),
			RUNS,
		);
	});

	it('clamping keeps a point on the workplane, and leaves points already on it alone', () => {
		const size = fc.tuple(fc.integer({ min: 10, max: 1000 }), fc.integer({ min: 10, max: 1000 }));
		fc.assert(
			fc.property(fc.tuple(value, value), size, (p, [w, d]) => {
				const [x, y] = clampToWorkplane(p, [w, d]);
				expect(Math.abs(x)).toBeLessThanOrEqual(w / 2);
				expect(Math.abs(y)).toBeLessThanOrEqual(d / 2);
				expect(clampToWorkplane([x, y], [w, d])).toEqual([x, y]);
			}),
			RUNS,
		);
	});
});

// ---------------------------------------------------------------- stored models

/** A mesh of random triangles over a few random corners. */
const aMesh = fc
	.tuple(
		fc.array(fc.tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 }), fc.integer({ min: -100, max: 100 })), {
			minLength: 4,
			maxLength: 12,
		}),
		fc.nat(),
	)
	.chain(([corners, seed]) =>
		fc
			.array(fc.tuple(fc.nat(corners.length - 1), fc.nat(corners.length - 1), fc.nat(corners.length - 1)), { minLength: 1, maxLength: 20 })
			.map((tris) => ({
				positions: Float32Array.from(corners.flat().map((v) => v + (seed % 3) * 0)),
				indices: Uint32Array.from(tris.flat()),
			})),
	);

describe('stored models', () => {
	it('encoding then decoding gives the same mesh back', () => {
		fc.assert(
			fc.property(aMesh, (mesh) => {
				const back = decodeMesh(encodeMesh(mesh));
				expect([...back.positions]).toEqual([...mesh.positions]);
				expect([...back.indices]).toEqual([...mesh.indices]);
			}),
			RUNS,
		);
	});

	it('random bytes are refused with the mesh error, never anything else', () => {
		fc.assert(
			fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
				try {
					decodeMesh(bytes);
				} catch (error) {
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toMatch(/^Not a valid stored mesh/);
				}
			}),
			{ numRuns: 500 },
		);
	});

	it('flipping any single byte of a good mesh is either refused cleanly or still decodes to a safe mesh', () => {
		fc.assert(
			fc.property(aMesh, fc.nat(), fc.integer({ min: 0, max: 255 }), (mesh, at, byte) => {
				const bytes = encodeMesh(mesh);
				bytes[at % bytes.length] = byte;
				try {
					const m = decodeMesh(bytes);
					for (const i of m.indices) expect(i).toBeLessThan(m.positions.length / 3);
					expect(m.positions.every(Number.isFinite)).toBe(true);
				} catch (error) {
					expect((error as Error).message).toMatch(/^Not a valid stored mesh/);
				}
			}),
			{ numRuns: 400 },
		);
	});

	it('fitting a model into the unit box keeps it inside, standing on z = 0, with its true size reported', () => {
		fc.assert(
			fc.property(aMesh, (mesh) => {
				let result: ReturnType<typeof normalizeMesh>;
				try {
					result = normalizeMesh(mesh);
				} catch (error) {
					expect((error as Error).message).toMatch(/flat|too large/); // only those two reasons
					return;
				}
				const p = result.mesh.positions;
				for (let i = 0; i < p.length; i += 3) {
					expect(Math.abs(p[i]!)).toBeLessThanOrEqual(0.5 + 1e-5);
					expect(Math.abs(p[i + 1]!)).toBeLessThanOrEqual(0.5 + 1e-5);
					expect(p[i + 2]!).toBeGreaterThanOrEqual(-1e-5);
					expect(p[i + 2]!).toBeLessThanOrEqual(1 + 1e-5);
				}
				for (const s of result.size) expect(s).toBeGreaterThan(0);
				expect(result.mesh.indices.length).toBe(mesh.indices.length);
			}),
			RUNS,
		);
	});

	it('turning a model inside out and fitting it gives the same volume as fitting it as it was', () => {
		fc.assert(
			fc.property(aMesh, (mesh) => {
				const inside = { positions: mesh.positions, indices: Uint32Array.from(mesh.indices) };
				for (let t = 0; t < inside.indices.length; t += 3)
					[inside.indices[t + 1], inside.indices[t + 2]] = [inside.indices[t + 2]!, inside.indices[t + 1]!];
				try {
					const a = Math.abs(signedVolume(normalizeMesh(mesh).mesh));
					const b = Math.abs(signedVolume(normalizeMesh(inside).mesh));
					expect(a).toBeCloseTo(b, 4);
				} catch (error) {
					expect((error as Error).message).toMatch(/flat|too large/);
				}
			}),
			RUNS,
		);
	});
});
