import { addShape, createEmptyDesign, type Design, groupNodes, moveNodes, setNodeMode, setShapeSize } from '@holecraft/core';
import type { ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectBodies } from './export.ts';
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
			(p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
				p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
				p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
			6;
	}
	return sum;
}

const lowest = (mesh: GroupMesh) => Math.min(...Array.from({ length: mesh.positions.length / 3 }, (_, i) => mesh.positions[i * 3 + 2]!));

/** A 20 mm box whose base is `z` mm above the plane (negative: partly underground). */
function boxAt(z: number, id = 'b', base: Design = createEmptyDesign('t')): Design {
	const added = addShape(base, 'box', [0, 0], { id }).design;
	const sized = setShapeSize(added, id, { width: 20, depth: 20, height: 20 });
	return moveNodes(sized, [id], [0, 0, z]);
}

describe('collectBodies: the part below the workplane', () => {
	it('keeps a body as it is by default, underground part and all', () => {
		const [body] = collectBodies(M, boxAt(-5), undefined);
		expect(lowest(body!.mesh)).toBeCloseTo(-5, 4);
		expect(volume(body!.mesh)).toBeCloseTo(8000, 1);
	});

	it('cuts a body off at the plane when asked: only what is at or above z = 0 is left', () => {
		const [body] = collectBodies(M, boxAt(-5), undefined, { cutBelowPlane: true });
		expect(lowest(body!.mesh)).toBeCloseTo(0, 4);
		expect(volume(body!.mesh)).toBeCloseTo(20 * 20 * 15, 1);
	});

	it('leaves a body that is wholly above the plane exactly as it was', () => {
		const [kept] = collectBodies(M, boxAt(3), undefined);
		const [cut] = collectBodies(M, boxAt(3), undefined, { cutBelowPlane: true });
		expect(volume(cut!.mesh)).toBeCloseTo(volume(kept!.mesh), 6);
		expect(cut!.mesh.indices.length).toBe(kept!.mesh.indices.length);
	});

	it('leaves out a body that is wholly underground, and keeps the others in order', () => {
		const two = boxAt(-30, 'under', boxAt(0, 'on'));
		const bodies = collectBodies(M, two, undefined, { cutBelowPlane: true });
		expect(bodies.map((b) => b.name)).toEqual(['Box 1']);
	});

	it('cuts a group by its finished shape (a hole inside is cut first, then the plane)', () => {
		let d = boxAt(-10, 'solid');
		d = addShape(d, 'box', [0, 0], { id: 'hole' }).design;
		d = setShapeSize(d, 'hole', { width: 10, depth: 10, height: 40 });
		d = moveNodes(d, ['hole'], [0, 0, -20]);
		d = setNodeMode(d, ['hole'], 'hole');
		const g = groupNodes(d, ['solid', 'hole'], { id: 'g' });
		const [body] = collectBodies(M, g.design, undefined, { cutBelowPlane: true });
		// the 20 mm box is 10 mm underground; above the plane it is 20 x 20 x 10 less the 10 x 10 hole through it
		expect(volume(body!.mesh)).toBeCloseTo(20 * 20 * 10 - 10 * 10 * 10, 1);
		expect(lowest(body!.mesh)).toBeCloseTo(0, 4);
	});
});
