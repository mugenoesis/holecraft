import {
	addShape,
	createEmptyDesign,
	type Design,
	type EdgeTreatment,
	groupGeometry,
	groupNodes,
	setEdgeTreatments,
	setGroupGeometry,
	setNodeMode,
	setShapeGeometry,
	setShapeSize,
	treatEdges,
} from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { loadManifold } from './load.ts';
import { toolEdges } from './toolEdges.ts';
import type { GroupMesh } from './types.ts';

/*
 * Chamfers and rounds must stay on their edges when the shape is resized. The reference is independent of the resizing code:
 * a shape built at the final size and chamfered directly. A stretched chamfer is cut fresh from the stretched edges at the same
 * size, so the two must remove the same material.
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

/** A box and a sphere with a through hole the same size as both (an oval wall of material left at the corners), grouped, at `width` x `depth`. */
function ovalBlock(width: number, depth: number): Design {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'b' }).design;
	d = addShape(d, 'sphere', [0, 0], { id: 's' }).design;
	d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
	for (const id of ['b', 's', 'h']) d = setShapeSize(d, id, { width, depth, height: 20 });
	d = setNodeMode(d, ['h'], 'hole');
	return groupNodes(d, ['b', 's', 'h'], { id: 'g' }).design;
}

/** Every edge the Edge tool offers on the group, chamfered `size` (as "All outer edges" does). */
function chamferAll(design: Design, size: number): Design {
	const found = toolEdges(M, design, 'g');
	let n = 0;
	const list: EdgeTreatment[] = treatEdges(
		[],
		found,
		found.map((_, i) => i),
		'chamfer',
		size,
		() => `t${++n}`,
	);
	return setEdgeTreatments(design, 'g', list);
}

const removed = (plain: Design, treatedDesign: Design) =>
	volume(evaluateGroup(M, plain, 'g')!) - volume(evaluateGroup(M, treatedDesign, 'g')!);

describe('resizing a group that has chamfers on its edges', () => {
	it('keeps every chamfer: none are skipped, and the same material comes off as chamfering the resized shape directly', () => {
		const small = chamferAll(ovalBlock(30, 36), 2);
		expect(small.nodes.g!.edges!.length).toBeGreaterThan(5);
		const g = groupGeometry(small, 'g')!;
		const resized = setGroupGeometry(small, 'g', { ...g, width: 37, depth: 50 });
		expect(resized).not.toBe(small);

		const result = evaluateGroup(M, resized, 'g')!;
		expect(result.skippedEdges ?? []).toEqual([]);

		// the reference: a block made at 37 x 50 and chamfered the same way (same size, the same edges)
		const direct = chamferAll(ovalBlock(37, 50), 2);
		const wanted = removed(ovalBlock(37, 50), direct);
		const got = removed(ovalBlock(37, 50), resized);
		expect(Math.abs(got - wanted) / wanted).toBeLessThan(0.01);
		expect(volume(result)).toBeCloseTo(volume(evaluateGroup(M, direct, 'g')!), -1); // within about 5 mm3 of 10,000
	});

	it('also when the group is made smaller, and when it only gets taller', () => {
		const big = chamferAll(ovalBlock(40, 40), 2);
		const g = groupGeometry(big, 'g')!;
		for (const change of [{ width: 28, depth: 30 }, { height: 12 }]) {
			const resized = setGroupGeometry(big, 'g', { ...g, ...change });
			expect(evaluateGroup(M, resized, 'g')!.skippedEdges ?? []).toEqual([]);
		}
	});

	it('shows the problem it fixes: without stretching them, resizing leaves the chamfers behind (reported as skipped)', () => {
		// the same resize done by changing every shape's size by hand does NOT move the group's own treatments
		const small = chamferAll(ovalBlock(30, 36), 2);
		let byHand = small;
		for (const id of ['b', 's', 'h']) byHand = setShapeSize(byHand, id, { width: 37, depth: 50 });
		expect((evaluateGroup(M, byHand, 'g')!.skippedEdges ?? []).length).toBeGreaterThan(0);
	});
});

describe('resizing a loose shape that has chamfers on its edges', () => {
	function box(width: number, depth: number, height: number): Design {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
		d = setShapeSize(d, 'a', { width, depth, height });
		return d;
	}

	/** Chamfers the box's own top edges, 2 mm, found on the box on its own. */
	function chamfered(width: number, depth: number, height: number): Design {
		const d = box(width, depth, height);
		const found = toolEdges(M, d, 'a').filter((e) => e.points.every((p) => Math.abs(p[2] - height) < 1e-6));
		let n = 0;
		return setEdgeTreatments(
			d,
			'a',
			treatEdges(
				[],
				found,
				found.map((_, i) => i),
				'chamfer',
				2,
				() => `t${++n}`,
			),
		);
	}

	it('keeps the chamfers when the size is typed or dragged', () => {
		const small = chamfered(20, 20, 20);
		const dragged = setShapeGeometry(small, 'a', { x: 0, y: 0, z: 0, width: 35, depth: 25, height: 12 });
		const typed = setShapeSize(small, 'a', { width: 35, depth: 25, height: 12 });
		const direct = chamfered(35, 25, 12);
		for (const d of [dragged, typed]) {
			const r = evaluateGroup(M, d, 'a')!;
			expect(r.skippedEdges ?? []).toEqual([]);
			expect(volume(r)).toBeCloseTo(volume(evaluateGroup(M, direct, 'a')!), 3);
		}
	});
});
