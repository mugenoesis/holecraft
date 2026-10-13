import { describe, expect, it } from 'vitest';
import { canFlip, flipNodes } from './arrange.ts';
import type { Vec3 } from './camera.ts';
import { createEmptyDesign, type Design, type Mat4, type ShapeNode } from './design.ts';
import { setNodeEuler } from './edit.ts';
import { groupNodes } from './groups.ts';
import { multiplyMat4 } from './mat4.ts';
import { addMeshShape, isMirrored, type MeshData, mirrorMeshX, normalizeMesh, signedVolume } from './meshShape.ts';
import { addShape, nodeBoundsIn } from './ops.ts';
import { setLocked } from './visibility.ts';

/** A closed, lopsided model (10 x 20 x 30 mm, leaning to one side), so a mirror image is not the same as a turned copy. */
const tetra: MeshData = {
	positions: new Float32Array([100, 100, 5, 110, 100, 5, 100, 120, 5, 100, 100, 35]),
	indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]),
};
const { mesh: unit, size } = normalizeMesh(tetra);
const REF = 'a'.repeat(64);

function withModel(at: [number, number] = [50, 20]): Design {
	return addMeshShape(createEmptyDesign('d'), { name: 'Bracket', ref: REF, size }, { at, id: 'm' }).design;
}

/** A node's transform in the world: its own, after those of the groups it is in. */
function worldTransform(design: Design, id: string): Mat4 {
	const parent = Object.values(design.nodes).find((n) => n.kind === 'group' && n.children.includes(id));
	const own = design.nodes[id]!.transform;
	return parent ? multiplyMat4(worldTransform(design, parent.id), own) : own;
}

/** Where the model's corners are in the world: its unit mesh (mirrored in x if the shape is), scaled to its size, then placed. */
function corners(design: Design, id = 'm'): Vec3[] {
	const node = design.nodes[id] as ShapeNode;
	const [w, d, h] = [node.params.width, node.params.depth, node.params.height].map(Number) as [number, number, number];
	const mesh = isMirrored(node) ? mirrorMeshX(unit) : unit;
	const t = worldTransform(design, id);
	return Array.from({ length: mesh.positions.length / 3 }, (_, i) => {
		const [x, y, z] = [mesh.positions[i * 3]! * w, mesh.positions[i * 3 + 1]! * d, mesh.positions[i * 3 + 2]! * h];
		return [0, 1, 2].map((k) => t[k]! * x + t[4 + k]! * y + t[8 + k]! * z + t[12 + k]!) as Vec3;
	});
}
const reflected = (points: Vec3[], axis: 0 | 1 | 2, at: number): Vec3[] =>
	points.map((p) => p.map((v, k) => (k === axis ? 2 * at - v : v)) as Vec3);
const close = (a: Vec3[], b: Vec3[]) => {
	expect(a).toHaveLength(b.length);
	for (const [i, p] of a.entries()) for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(b[i]![k]!, 4);
};
const middle = (points: Vec3[], axis: number) => (Math.min(...points.map((p) => p[axis]!)) + Math.max(...points.map((p) => p[axis]!))) / 2;
const det3 = (t: readonly number[]) =>
	t[0]! * (t[5]! * t[10]! - t[6]! * t[9]!) - t[4]! * (t[1]! * t[10]! - t[2]! * t[9]!) + t[8]! * (t[1]! * t[6]! - t[2]! * t[5]!);

describe('mirrorMeshX', () => {
	it('is the model seen in a mirror: x reversed and every triangle turned round, so it still faces outwards with the same volume', () => {
		const m = mirrorMeshX(unit);
		expect(Array.from(m.positions.slice(0, 3))).toEqual([-unit.positions[0]!, unit.positions[1]!, unit.positions[2]!]);
		expect(signedVolume(m)).toBeCloseTo(signedVolume(unit), 9);
		expect(signedVolume(m)).toBeGreaterThan(0);
		expect(Array.from(mirrorMeshX(m).positions)).toEqual(Array.from(unit.positions)); // twice is no change
	});
});

describe('flipping an imported model', () => {
	it('is allowed now', () => {
		expect(canFlip(withModel(), ['m'])).toBe(true);
	});

	for (const [axis, k] of [
		['x', 0],
		['y', 1],
		['z', 2],
	] as const) {
		it(`across ${axis.toUpperCase()}: the model ends up as the true mirror image of itself, in place (not a turned copy)`, () => {
			let d = withModel();
			d = { ...d, nodes: { ...d.nodes, m: { ...d.nodes.m!, transform: d.nodes.m!.transform.map((v, i) => (i === 14 ? 7 : v)) } } }; // lifted 7 mm
			const before = corners(d);
			const out = flipNodes(d, ['m'], axis);
			close(corners(out), reflected(before, k, middle(before, k)));
			expect(isMirrored(out.nodes.m as ShapeNode)).toBe(true);
		});
	}

	it('keeps a proper rotation for the shape (no negative scale), and its size', () => {
		const out = flipNodes(withModel(), ['m'], 'x');
		expect(det3((out.nodes.m as ShapeNode).transform)).toBeCloseTo(1, 9);
		expect((out.nodes.m as ShapeNode).params).toMatchObject({ width: size[0], depth: size[1], height: size[2] });
	});

	it('flipped twice, it is exactly as it was', () => {
		const d = withModel();
		const back = flipNodes(flipNodes(d, ['m'], 'y'), ['m'], 'y');
		close(corners(back), corners(d));
		expect(isMirrored(back.nodes.m as ShapeNode)).toBe(false);
		expect('mirror' in (back.nodes.m as ShapeNode).params).toBe(false);
	});

	it('is the mirror image whichever way the model is turned', () => {
		// Flip mirrors in a plane through the middle of the object's box (not of the lopsided model inside it)
		const boxMiddle = (d: Design, axis: number) => {
			const b = nodeBoundsIn(d, 'm')!;
			return (b.min[axis]! + b.max[axis]!) / 2;
		};
		const d = setNodeEuler(withModel(), 'm', [0, 0, 30]);
		close(corners(flipNodes(d, ['m'], 'y')), reflected(corners(d), 1, boxMiddle(d, 1)));
		const tipped = setNodeEuler(withModel(), 'm', [90, 0, 0]);
		close(corners(flipNodes(tipped, ['m'], 'x')), reflected(corners(tipped), 0, boxMiddle(tipped, 0)));
	});

	it('swaps sides with another object, and mirrors what is inside a group', () => {
		let d = addShape(withModel([0, 0]), 'box', [60, 0], { id: 'b' }).design;
		const before = corners(d);
		const swapped = flipNodes(d, ['m', 'b'], 'x');
		const [lo, hi] = [Math.min(...before.map((p) => p[0])), 70]; // the box reaches x = 70
		close(corners(swapped), reflected(before, 0, (lo + hi) / 2));
		d = groupNodes(d, ['m', 'b'], { id: 'g' }).design;
		const g = flipNodes(d, ['g'], 'x');
		close(corners(g), reflected(before, 0, (lo + hi) / 2));
		expect(isMirrored(g.nodes.m as ShapeNode)).toBe(true);
	});

	it('leaves a locked model alone', () => {
		const locked = setLocked(withModel(), ['m'], true);
		expect(flipNodes(locked, ['m'], 'x')).toBe(locked);
	});
});
