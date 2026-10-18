import { addResinHole, addShape, createEmptyDesign, type Design, setShapeSize } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateGroup } from './evaluate.ts';
import { loadManifold } from './load.ts';
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

/** A 20 mm box (8000 mm3). */
function box(): Design {
	const d = addShape(createEmptyDesign('t'), 'box', [0, 0], { id: 'b' }).design;
	return setShapeSize(d, 'b', { width: 20, depth: 20, height: 20 });
}

/** A round hole of 3.5 mm across, 5 mm of it inside the box. */
const HOLE_MM3 = Math.PI * 1.75 ** 2 * 5;

describe('drain and vent holes cut the shape they are added to', () => {
	it('a drain hole takes its volume out of the bottom', () => {
		const out = addResinHole(box(), ['b'], 'drain', 3.5, { groupId: 'g' });
		const mesh = evaluateGroup(M, out.design, 'g');
		expect(volume(mesh!)).toBeCloseTo(8000 - HOLE_MM3, 0);
	});

	it('a vent hole takes its volume out of the top, and with the drain both come out', () => {
		const drain = addResinHole(box(), ['b'], 'drain', 3.5, { groupId: 'g' });
		const both = addResinHole(drain.design, drain.selection, 'vent', 3.5);
		expect(volume(evaluateGroup(M, both.design, 'g')!)).toBeCloseTo(8000 - 2 * HOLE_MM3, 0);
	});
});
