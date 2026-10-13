import { addShape, createEmptyDesign, type Design, groupNodes, moveNodes, setHidden, setNodeMode, setShapeSize } from '@holecraft/core';
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

function volume(mesh: GroupMesh | null): number {
	if (!mesh) return 0;
	const p = mesh.positions;
	let sum = 0;
	for (let i = 0; i < mesh.indices.length; i += 3) {
		const [a, b, c] = [mesh.indices[i]! * 3, mesh.indices[i + 1]! * 3, mesh.indices[i + 2]! * 3];
		sum +=
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
}

/** A 20 mm box at the origin and a 10 x 10 x 30 box 40 mm along, grouped as 'g'. */
function twoBoxes(): Design {
	let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [40, 0], { id: 'b' }).design;
	d = setShapeSize(d, 'b', { width: 10, depth: 10, height: 30 });
	return groupNodes(d, ['a', 'b'], { id: 'g' }).design;
}

describe('hidden parts of a group', () => {
	it('are left out of what the group is worked out as, and of its export', () => {
		const d = twoBoxes();
		expect(volume(evaluateGroup(M, d, 'g'))).toBeCloseTo(8000 + 3000, 3);
		const noBig = setHidden(d, ['a'], true);
		expect(volume(evaluateGroup(M, noBig, 'g'))).toBeCloseTo(3000, 3);
		expect(volume(evaluateNode(M, noBig, 'g'))).toBeCloseTo(3000, 3);
		expect(volume(evaluateGroup(M, setHidden(d, ['a', 'b'], true), 'g'))).toBe(0); // nothing left to draw
	});

	it('leave out a hidden hole too, which then does not cut', () => {
		let d = addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'cylinder', [0, 0], { id: 'h' }).design;
		d = setShapeSize(d, 'h', { width: 10, depth: 10, height: 20 });
		d = setNodeMode(d, ['h'], 'hole');
		d = groupNodes(d, ['a', 'h'], { id: 'g' }).design;
		expect(volume(evaluateGroup(M, d, 'g'))).toBeLessThan(8000 - 1400); // a 10 mm bore: about 1570 mm3 less
		expect(volume(evaluateGroup(M, setHidden(d, ['h'], true), 'g'))).toBeCloseTo(8000, 3);
	});

	it('reach inside a group in a group', () => {
		let d = twoBoxes();
		d = addShape(d, 'box', [-40, 0], { id: 'c' }).design;
		d = groupNodes(d, ['g', 'c'], { id: 'outer' }).design;
		expect(volume(evaluateGroup(M, d, 'outer'))).toBeCloseTo(8000 + 3000 + 8000, 3);
		expect(volume(evaluateGroup(M, setHidden(d, ['b'], true), 'outer'))).toBeCloseTo(16000, 3);
	});

	it('change the key of the group’s result, so a cached shape is not reused (and undoing it brings the old one back)', () => {
		const d = twoBoxes();
		const hidden = setHidden(d, ['a'], true);
		expect(subtreeHash(hidden, 'g')).not.toBe(subtreeHash(d, 'g'));
		expect(subtreeHash(setHidden(hidden, ['a'], false), 'g')).toBe(subtreeHash(d, 'g'));
	});

	it('do not change the key when it is only a different, hidden part’s position that moved (it is not part of the shape)', () => {
		const d = setHidden(twoBoxes(), ['a'], true);
		expect(subtreeHash(moveNodes(d, ['a'], [5, 5, 0]), 'g')).toBe(subtreeHash(d, 'g'));
	});
});
