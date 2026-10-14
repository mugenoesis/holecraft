import { addShape, createEmptyDesign, type Design, type GroupNode, groupNodes, setNodeMode } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup, evaluateNode } from './evaluate.ts';
import { loadManifold } from './load.ts';
import { subtreeHash } from './subtree.ts';
import type { GroupMesh } from './types.ts';

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

function bounds(mesh: GroupMesh): { min: number[]; max: number[] } {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < mesh.positions.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
			max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
		}
	}
	return { min, max };
}

/** Two separate 20 mm boxes, grouped (spans x -10..70, y -10..10, z 0..20; volume 16000). */
function pair(): { d: Design; g: string } {
	let d = createEmptyDesign('d');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [60, 0], { id: 'b' }).design;
	const g = groupNodes(d, ['a', 'b'], { id: 'g' });
	return { d: g.design, g: g.id! };
}

const stretch = (d: Design, id: string, scale: [number, number, number]): Design => ({
	...d,
	nodes: { ...d.nodes, [id]: { ...(d.nodes[id] as GroupNode), scale } },
});

describe('a stretched group, as exported', () => {
	it('is the finished shape stretched along the group’s axes: the volume is multiplied by the three factors', () => {
		const { d, g } = pair();
		const plain = evaluateNode(M, d, g)!;
		const out = evaluateNode(M, stretch(d, g, [2, 3, 0.5]), g)!;
		expect(volume(plain)).toBeCloseTo(16000, 3);
		expect(volume(out)).toBeCloseTo(16000 * 3, 2);
		const b = bounds(out);
		expect(b.min.map((v) => Math.round(v * 1e3) / 1e3)).toEqual([-20, -30, 0]);
		expect(b.max.map((v) => Math.round(v * 1e3) / 1e3)).toEqual([140, 30, 10]);
	});

	it('has its holes cut first and is stretched after, so a hole is stretched with it', () => {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'solid' }).design;
		d = addShape(d, 'cylinder', [0, 0], { id: 'hole' }).design;
		d = setNodeMode(d, ['hole'], 'hole');
		const g = groupNodes(d, ['solid', 'hole'], { id: 'g' });
		const plain = volume(evaluateNode(M, g.design, 'g')!);
		const stretched = volume(evaluateNode(M, stretch(g.design, 'g', [2, 2, 2]), 'g')!);
		expect(stretched).toBeCloseTo(plain * 8, 2);
	});

	it('is placed by the group’s own transform after the stretch', () => {
		const { d, g } = pair();
		const moved: Design = {
			...d,
			nodes: { ...d.nodes, [g]: { ...d.nodes[g]!, transform: d.nodes[g]!.transform.map((v, i) => (i === 14 ? 7 : v)) } },
		};
		const b = bounds(evaluateNode(M, stretch(moved, g, [1, 1, 2]), g)!);
		expect(b.min[2]).toBeCloseTo(7);
		expect(b.max[2]).toBeCloseTo(7 + 40);
	});
});

describe('a stretched group, as drawn', () => {
	it('is worked out in its own frame, unstretched: the stretch is put on afterwards', () => {
		const { d, g } = pair();
		const plain = evaluateGroup(M, d, g)!;
		const out = evaluateGroup(M, stretch(d, g, [2, 3, 0.5]), g)!;
		expect(volume(out)).toBeCloseTo(volume(plain), 6);
	});

	it('does not change its cache key, so stretching never recomputes the cut', () => {
		const { d, g } = pair();
		expect(subtreeHash(stretch(d, g, [2, 3, 0.5]), g)).toBe(subtreeHash(d, g));
	});

	it('does change the key of a group inside another, whose shape it is part of', () => {
		const { d, g } = pair();
		let e = addShape(d, 'box', [200, 0], { id: 'c' }).design;
		e = addShape(e, 'box', [260, 0], { id: 'f' }).design;
		const inner = groupNodes(e, ['c', 'f'], { id: 'inner' });
		const outer = groupNodes(inner.design, ['inner', g], { id: 'outer' });
		expect(subtreeHash(stretch(outer.design, 'inner', [2, 1, 1]), 'outer')).not.toBe(subtreeHash(outer.design, 'outer'));
		// and the shape really is stretched: the inner pair is twice as long along x
		const wide = bounds(evaluateNode(M, stretch(outer.design, 'inner', [2, 1, 1]), 'outer')!);
		const flat = bounds(evaluateNode(M, outer.design, 'outer')!);
		expect(wide.max[0]! - wide.min[0]!).toBeGreaterThan(flat.max[0]! - flat.min[0]!);
	});
});
