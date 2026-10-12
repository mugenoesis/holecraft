import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { duplicateNodes } from './edit.ts';
import {
	addMeshShape,
	decodeMesh,
	encodeMesh,
	isMeshRef,
	MESH_SHAPE_TYPE,
	type MeshData,
	normalizeMesh,
	signedVolume,
} from './meshShape.ts';
import { shapeBounds } from './ops.ts';
import { parseDesign } from './validate.ts';

/** A closed tetrahedron with outward-facing triangles. */
const tetra = (): MeshData => ({
	positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 30]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
});

const REF = 'a'.repeat(64);

describe('encodeMesh / decodeMesh', () => {
	it('round-trips a mesh exactly', () => {
		const decoded = decodeMesh(encodeMesh(tetra()));
		expect([...decoded.positions]).toEqual([...tetra().positions]);
		expect([...decoded.indices]).toEqual([...tetra().indices]);
	});

	it('works on a view into a bigger buffer (not 4-byte aligned)', () => {
		const bytes = encodeMesh(tetra());
		const padded = new Uint8Array(bytes.length + 3);
		padded.set(bytes, 3);
		expect([...decodeMesh(padded.subarray(3)).indices]).toEqual([...tetra().indices]);
	});

	it('rejects data that is not a mesh', () => {
		expect(() => decodeMesh(new Uint8Array(40))).toThrow(/mesh/i);
		expect(() => decodeMesh(new Uint8Array(2))).toThrow(/mesh/i);
	});

	it('rejects a truncated or padded mesh', () => {
		const bytes = encodeMesh(tetra());
		expect(() => decodeMesh(bytes.subarray(0, bytes.length - 4))).toThrow(/mesh/i);
		expect(() => decodeMesh(new Uint8Array([...bytes, 0]))).toThrow(/mesh/i);
	});

	it('rejects triangles that point at corners that do not exist', () => {
		const bad = tetra();
		bad.indices[0] = 99;
		expect(() => decodeMesh(encodeMesh(bad))).toThrow(/mesh/i);
	});

	it('rejects numbers that are not finite', () => {
		const bad = tetra();
		bad.positions[0] = Number.NaN;
		expect(() => decodeMesh(encodeMesh(bad))).toThrow(/mesh/i);
	});
});

describe('isMeshRef', () => {
	it('accepts a 64-digit lower-case hex string only', () => {
		expect(isMeshRef(REF)).toBe(true);
		expect(isMeshRef('A'.repeat(64))).toBe(false);
		expect(isMeshRef('a'.repeat(63))).toBe(false);
		expect(isMeshRef('../etc/passwd')).toBe(false);
		expect(isMeshRef(5)).toBe(false);
	});
});

describe('normalizeMesh', () => {
	it('fits the mesh into the unit box: x and y within ±0.5, z from 0 to 1', () => {
		const { mesh, size } = normalizeMesh(tetra());
		expect(size).toEqual([10, 20, 30]);
		const xs = [...mesh.positions].filter((_, i) => i % 3 === 0);
		const ys = [...mesh.positions].filter((_, i) => i % 3 === 1);
		const zs = [...mesh.positions].filter((_, i) => i % 3 === 2);
		expect(Math.min(...xs)).toBeCloseTo(-0.5);
		expect(Math.max(...xs)).toBeCloseTo(0.5);
		expect(Math.min(...ys)).toBeCloseTo(-0.5);
		expect(Math.max(...ys)).toBeCloseTo(0.5);
		expect(Math.min(...zs)).toBeCloseTo(0);
		expect(Math.max(...zs)).toBeCloseTo(1);
	});

	it('centres a model that was made far from the origin', () => {
		const far = tetra();
		for (let i = 0; i < far.positions.length; i += 3) {
			far.positions[i]! += 500;
			far.positions[i + 1]! -= 300;
			far.positions[i + 2]! += 40;
		}
		const { mesh, size } = normalizeMesh(far);
		expect(size).toEqual([10, 20, 30]);
		expect(Math.min(...[...mesh.positions].filter((_, i) => i % 3 === 0))).toBeCloseTo(-0.5);
	});

	it('turns inside-out triangles the right way round', () => {
		const inside = tetra();
		for (let t = 0; t < inside.indices.length; t += 3) {
			const b = inside.indices[t + 1]!;
			inside.indices[t + 1] = inside.indices[t + 2]!;
			inside.indices[t + 2] = b;
		}
		expect(signedVolume(inside)).toBeLessThan(0);
		expect(signedVolume(normalizeMesh(inside).mesh)).toBeGreaterThan(0);
	});

	describe('a model made of several separate pieces (shells)', () => {
		/** A cube from `lo` to `hi` (mm) as its own shell: outward-facing triangles, or inward with `inward`. */
		const cube = (lo: number, hi: number, inward = false): MeshData => {
			const c = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? hi : lo, i & 2 ? hi : lo, i & 4 ? hi : lo]);
			// two triangles per face, counter-clockwise seen from outside
			const faces = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
			const indices = inward ? faces.map((_, i) => faces[i - (i % 3) + [0, 2, 1][i % 3]!]!) : faces;
			return { positions: new Float32Array(c), indices: new Uint32Array(indices) };
		};
		/** Several shells as one mesh, as a file would give them. */
		const join = (...shells: MeshData[]): MeshData => {
			const positions: number[] = [];
			const indices: number[] = [];
			for (const s of shells) {
				const base = positions.length / 3;
				positions.push(...s.positions);
				indices.push(...[...s.indices].map((i) => i + base));
			}
			return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
		};
		/** The signed volume of each shell of a normalised mesh (shells keep their order: 36 indices each). */
		const shellVolumes = (m: MeshData) =>
			Array.from({ length: m.indices.length / 36 }, (_, s) =>
				signedVolume({ positions: m.positions, indices: m.indices.subarray(s * 36, s * 36 + 36) }),
			);

		it('the cube helper is right: an outward cube has a positive volume, an inward one negative', () => {
			expect(signedVolume(cube(0, 10))).toBeCloseTo(1000);
			expect(signedVolume(cube(0, 10, true))).toBeCloseTo(-1000);
		});

		it('turns round one inside-out piece even when the rest outweighs it', () => {
			const { mesh } = normalizeMesh(join(cube(0, 10), cube(20, 30), cube(40, 50, true)));
			expect(shellVolumes(mesh).every((v) => v > 0)).toBe(true);
		});

		it('leaves a hollow model’s inner wall facing into the hollow', () => {
			const { mesh } = normalizeMesh(join(cube(0, 30), cube(10, 20, true)));
			const [outer, inner] = shellVolumes(mesh);
			expect(outer).toBeGreaterThan(0);
			expect(inner).toBeLessThan(0);
		});

		it('turns a whole hollow model round when both its walls face the wrong way', () => {
			const { mesh } = normalizeMesh(join(cube(0, 30, true), cube(10, 20)));
			const [outer, inner] = shellVolumes(mesh);
			expect(outer).toBeGreaterThan(0);
			expect(inner).toBeLessThan(0);
		});

		it('a piece within another’s bounding box but outside the piece itself is not a hollow', () => {
			// a big sloped tetrahedron (0..30, 0..60, 0..90) and a cube in the empty corner of its box, beyond the sloped face
			const big = tetra();
			const sloped = { positions: big.positions.map((v) => v * 3), indices: big.indices };
			const { mesh } = normalizeMesh(join(sloped, cube(20, 25)));
			expect(signedVolume({ positions: mesh.positions, indices: mesh.indices.subarray(12) })).toBeGreaterThan(0);
		});

		it('a solid piece inside a hollow faces outwards again (three walls deep)', () => {
			const { mesh } = normalizeMesh(join(cube(0, 30), cube(5, 25, true), cube(10, 20, true)));
			const [outer, hollow, core] = shellVolumes(mesh);
			expect([outer! > 0, hollow! < 0, core! > 0]).toEqual([true, true, true]);
		});
	});

	it('leaves correctly wound triangles alone', () => {
		expect(signedVolume(normalizeMesh(tetra()).mesh)).toBeGreaterThan(0);
	});

	it('refuses a model with no thickness', () => {
		const flat: MeshData = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]) };
		expect(() => normalizeMesh(flat)).toThrow(/flat|thickness/i);
	});

	it('refuses a model bigger than the biggest shape allowed', () => {
		const huge = tetra();
		huge.positions[3] = 5000;
		expect(() => normalizeMesh(huge)).toThrow(/too large|1000/i);
	});
});

describe('duplicating an imported model', () => {
	const one = () => addMeshShape(createEmptyDesign('d', 'T'), { name: 'Bracket', ref: REF, size: [10, 20, 30] }, { id: 'm1' }).design;

	it('copies it, sharing the same stored mesh, named as a copy', () => {
		const { design, ids } = duplicateNodes(one(), ['m1'], [10, 10]);
		expect(ids).toHaveLength(1);
		const copy = design.nodes[ids[0]!]!;
		expect(copy).toMatchObject({ kind: 'shape', shapeType: MESH_SHAPE_TYPE, name: 'Bracket copy' });
		expect(copy.kind === 'shape' && copy.params.mesh).toBe(REF);
		expect(design.roots).toHaveLength(2);
	});

	it('numbers further copies instead of piling up "copy copy"', () => {
		let d = one();
		d = duplicateNodes(d, ['m1'], [10, 10]).design;
		const second = duplicateNodes(d, ['m1'], [20, 20]);
		expect(second.design.nodes[second.ids[0]!]!.name).toBe('Bracket copy 2');
		const third = duplicateNodes(second.design, [second.ids[0]!], [30, 30]);
		expect(third.design.nodes[third.ids[0]!]!.name).toBe('Bracket copy 3');
	});
});

describe('addMeshShape', () => {
	const base = () => createEmptyDesign('d', 'Test');

	it('adds a solid shape named after the file, at its real size, on the workplane', () => {
		const { design, id } = addMeshShape(base(), { name: 'Bracket', ref: REF, size: [10, 20, 30] }, { at: [5, -5], id: 'm1' });
		expect(id).toBe('m1');
		const node = design.nodes.m1!;
		expect(node).toMatchObject({ kind: 'shape', shapeType: MESH_SHAPE_TYPE, name: 'Bracket', mode: 'solid' });
		expect(node.kind === 'shape' && node.params).toMatchObject({ width: 10, depth: 20, height: 30, mesh: REF });
		expect(design.roots).toEqual(['m1']);
		const bounds = shapeBounds(node as never);
		expect(bounds.min).toEqual([0, -15, 0]);
		expect(bounds.max).toEqual([10, 5, 30]);
	});

	it('remembers the original size, so a resize can be undone by hand', () => {
		const { design } = addMeshShape(base(), { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1' });
		expect(design.nodes.m1!.kind === 'shape' && design.nodes.m1!.params).toMatchObject({
			originalWidth: 10,
			originalDepth: 20,
			originalHeight: 30,
		});
	});

	it('does not change the design it was given', () => {
		const d = base();
		addMeshShape(d, { name: 'Part', ref: REF, size: [1, 1, 1] }, { id: 'm1' });
		expect(d.roots).toEqual([]);
	});

	it('survives being saved and loaded', () => {
		const { design } = addMeshShape(base(), { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1' });
		const loaded = parseDesign(JSON.parse(JSON.stringify(design)));
		expect(loaded.nodes.m1).toEqual(design.nodes.m1);
	});

	it('is refused on load when the mesh reference is not a proper one', () => {
		const { design } = addMeshShape(base(), { name: 'Part', ref: REF, size: [10, 20, 30] }, { id: 'm1' });
		const bad = JSON.parse(JSON.stringify(design));
		bad.nodes.m1.params.mesh = '../../secret';
		expect(() => parseDesign(bad)).toThrow(/mesh/i);
		delete bad.nodes.m1.params.mesh;
		expect(() => parseDesign(bad)).toThrow(/mesh/i);
	});
});
