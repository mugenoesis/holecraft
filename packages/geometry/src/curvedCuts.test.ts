import {
	addShape,
	createEmptyDesign,
	type Design,
	type EdgeTreatment,
	groupNodes,
	type MeshEdge,
	setEdgeTreatments,
	setNodeMode,
	setShapeSize,
	sharpEdges,
	treatEdges,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { loadManifold } from './load.ts';
import type { GroupMesh } from './types.ts';

/*
 * Chamfers and rounds along a curved rim, such as the rim of a round or oval hole. The cut must follow the curve smoothly: the
 * volume it removes comes from Pappus's theorem (the swept cross-section's area times the path its centre takes), worked out
 * here from the rim's own measured length, and the surface left behind must not be ragged (a stepped cut shows up as thousands
 * of tiny edges, and a cutter that overshoots removes far too much).
 */

let M: ManifoldToplevel;
beforeAll(async () => {
	M = await loadManifold();
});

function volume(mesh: GroupMesh): number {
	const p = mesh.positions;
	let sum = 0;
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const [a, b, c] = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
		sum +=
			p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
			p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
			p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
	}
	return sum / 6;
}

const length = (e: MeshEdge) =>
	e.points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - e.points[i]![0], p[1] - e.points[i]![1], p[2] - e.points[i]![2]), 0);

/** A 20 mm cube with a hole of the given width and depth (mm) right through it, grouped. */
function drilled(width: number, depth: number): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'b' }).design;
	d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
	d = setShapeSize(d, 'h', { width, depth, height: 40 });
	d = setNodeMode(d, ['h'], 'hole');
	return groupNodes(d, ['b', 'h'], { id: 'g' }).design;
}

/** The closed rim of the hole in the cube's top face, and the design with `kind` of `size` cut along it. */
function treatedRim(design: Design, kind: EdgeTreatment['kind'], size: number) {
	const rim = sharpEdges(evaluateGroup(M, design, 'g')!).find((e) => e.closed && e.points.every((p) => Math.abs(p[2] - 20) < 1e-6))!;
	return {
		rim,
		design: setEdgeTreatments(
			design,
			'g',
			treatEdges([], [rim], [0], kind, size, () => 't1'),
		),
	};
}

/** Pappus for a swept corner of area `area` whose centre lies `offset` out from a closed convex rim of length `perimeter`. */
const swept = (area: number, offset: number, perimeter: number) => area * (perimeter + 2 * Math.PI * offset);

const HOLES = [
	['a round hole', 6, 6],
	['an oval hole (5 x 6)', 5, 6],
	['a narrow oval hole (3 x 8)', 3, 8],
] as const;

describe('chamfering the rim of a hole', () => {
	for (const [name, w, d] of HOLES) {
		it(`removes the swept triangle of material (s*s/2 turned round the rim) from ${name}`, () => {
			const s = 1.5;
			const plain = drilled(w, d);
			const { rim, design } = treatedRim(plain, 'chamfer', s);
			const removed = volume(evaluateGroup(M, plain, 'g')!) - volume(evaluateGroup(M, design, 'g')!);
			// the right triangle with legs s has its centre s/3 from the wall, on the material's side
			const expected = swept((s * s) / 2, s / 3, length(rim));
			expect(Math.abs(removed - expected) / expected).toBeLessThan(0.03);
		});

		it(`leaves a clean surface on ${name}: a few long edges, no ragged steps`, () => {
			const { design } = treatedRim(drilled(w, d), 'chamfer', 1.5);
			const edges = sharpEdges(evaluateGroup(M, design, 'g')!);
			// the cube's 12 edges, the chamfer's two rims and the hole's bottom rim: about 15 whole edges
			expect(edges.length).toBeLessThan(30);
			expect(edges.filter((e) => length(e) < 0.5)).toEqual([]);
		});
	}

	it('also works when the chamfer is nearly as big as the hole (3 mm on a 5 x 6 hole)', () => {
		const plain = drilled(5, 6);
		const { rim, design } = treatedRim(plain, 'chamfer', 3);
		const removed = volume(evaluateGroup(M, plain, 'g')!) - volume(evaluateGroup(M, design, 'g')!);
		expect(Math.abs(removed - swept(4.5, 1, length(rim))) / swept(4.5, 1, length(rim))).toBeLessThan(0.05);
	});
});

describe('rounding the rim of a hole', () => {
	for (const [name, w, d] of HOLES) {
		it(`removes the swept corner (what a quarter circle leaves of a square) from ${name}`, () => {
			const r = 1.5;
			const plain = drilled(w, d);
			const { rim, design } = treatedRim(plain, 'round', r);
			const removed = volume(evaluateGroup(M, plain, 'g')!) - volume(evaluateGroup(M, design, 'g')!);
			// the corner of a square r wide that a quarter circle of radius r leaves: area r*r*(1 - pi/4), its centre 0.2232 r from the wall
			const expected = swept(r * r * (1 - Math.PI / 4), 0.2232 * r, length(rim));
			expect(Math.abs(removed - expected) / expected).toBeLessThan(0.05);
		});

		it(`leaves a clean surface on ${name}: no ragged steps`, () => {
			const { design } = treatedRim(drilled(w, d), 'round', 1.5);
			const edges = sharpEdges(evaluateGroup(M, design, 'g')!);
			expect(edges.length).toBeLessThan(30);
			expect(edges.filter((e) => length(e) < 0.5)).toEqual([]);
		});
	}
});
