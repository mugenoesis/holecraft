import { addShape, createEmptyDesign, groupNodes, moveNodes, setNodeMode, setShapeSize } from '@holecraft/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectBodies } from './export.ts';
import { loadManifold } from './load.ts';
import { measureBodies } from './measure.ts';

let M: Awaited<ReturnType<typeof loadManifold>>;
beforeAll(async () => {
	M = await loadManifold();
});

/** A 60 x 40 x 30 block with a 52 x 32 x 28 pocket cut from the top (2 mm walls and floor). */
function openBox() {
	let d = createEmptyDesign('d', 'Tray');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = setShapeSize(d, 'a', { width: 60, depth: 40, height: 30 });
	d = addShape(d, 'box', [0, 0], { id: 'c' }).design;
	d = setShapeSize(d, 'c', { width: 52, depth: 32, height: 30 });
	d = moveNodes(d, ['c'], [0, 0, 2]);
	d = setNodeMode(d, ['c'], 'hole');
	return groupNodes(d, ['a', 'c'], { id: 'g' }).design;
}

describe('measureBodies', () => {
	it('gives the bounds, size and volume of a cut shape, worked out by hand', () => {
		const [r] = measureBodies(collectBodies(M, openBox()));
		expect(r!.volume).toBeCloseTo(60 * 40 * 30 - 52 * 32 * 28, 3); // 25408
		expect(r!.min).toEqual([-30, -20, 0]);
		expect(r!.max).toEqual([30, 20, 30]);
		expect(r!.size).toEqual([60, 40, 30]);
		expect(r!.closed).toBe(true);
		expect(r!.problems).toEqual([]);
		expect(r!.triangles).toBeGreaterThan(0);
	});

	it('reports one entry per exported body, with its name and colour', () => {
		let d = openBox();
		d = addShape(d, 'box', [100, 0], { id: 'b2' }).design;
		const reports = measureBodies(collectBodies(M, d));
		expect(reports).toHaveLength(2);
		expect(reports.map((r) => r.name)).toContain('Group 1');
		expect(reports.every((r) => /^#[0-9a-f]{6}$/i.test(r.color))).toBe(true);
	});

	it('says what is wrong with a surface that is not closed', () => {
		const [good] = collectBodies(M, openBox());
		// take one triangle away: the rim of the gap is an open edge
		const mesh = { ...good!.mesh, indices: good!.mesh.indices.slice(3) };
		const [r] = measureBodies([{ ...good!, mesh }]);
		expect(r!.closed).toBe(false);
		expect(r!.problems.join(' ')).toMatch(/open edge/);
	});

	it('has nothing to say about a design that exports nothing', () => {
		const d = setNodeMode(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, ['a'], 'hole');
		expect(measureBodies(collectBodies(M, d))).toEqual([]);
	});
});
