import { describe, expect, it } from 'vitest';
import { alignNodes, canAlign, canFlip, flipNodes } from './arrange.ts';
import { createEmptyDesign, type Design } from './design.ts';
import { setNodeEuler, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn } from './ops.ts';

/** Two boxes: A is 10x10x10 at (0,0); B is 20x20x30 at (50,30). */
function twoBoxes() {
	let d = createEmptyDesign('t');
	d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
	d = addShape(d, 'box', [50, 30], { id: 'b' }).design;
	d = setShapeSize(d, 'a', { width: 10, depth: 10, height: 10 });
	d = setShapeSize(d, 'b', { width: 20, depth: 20, height: 30 });
	return { d, a: 'a', b: 'b' };
}

const bounds = (d: Design, id: string) => nodeBoundsIn(d, id)!;

describe('alignNodes', () => {
	it('aligns minimums on an axis', () => {
		const { d, a, b } = twoBoxes();
		const out = alignNodes(d, [a, b], 'x', 'min');
		expect(bounds(out, a).min[0]).toBeCloseTo(bounds(out, b).min[0]);
		expect(bounds(out, a).min[0]).toBeCloseTo(-5); // everything lines up with the leftmost edge (A: -5..5, B: 40..60)
	});

	it('aligns centres and maximums', () => {
		const { d, a, b } = twoBoxes();
		const mid = alignNodes(d, [a, b], 'y', 'centre');
		const ca = (bounds(mid, a).min[1] + bounds(mid, a).max[1]) / 2;
		const cb = (bounds(mid, b).min[1] + bounds(mid, b).max[1]) / 2;
		expect(ca).toBeCloseTo(cb);
		const hi = alignNodes(d, [a, b], 'z', 'max');
		expect(bounds(hi, a).max[2]).toBeCloseTo(30);
		expect(bounds(hi, b).max[2]).toBeCloseTo(30);
	});

	it('moves only along the chosen axis', () => {
		const { d, a, b } = twoBoxes();
		const out = alignNodes(d, [a, b], 'x', 'max');
		expect(bounds(out, a).min[1]).toBe(bounds(d, a).min[1]);
		expect(bounds(out, a).min[2]).toBe(bounds(d, a).min[2]);
	});

	it('does nothing for one object, or when already aligned (same object back)', () => {
		const { d, a, b } = twoBoxes();
		expect(alignNodes(d, [a], 'x', 'min')).toBe(d);
		const once = alignNodes(d, [a, b], 'x', 'min');
		expect(alignNodes(once, [a, b], 'x', 'min')).toBe(once);
	});

	it('never lifts anything below the workplane when centring on Z', () => {
		const { d, a, b } = twoBoxes();
		const out = alignNodes(d, [a, b], 'z', 'centre');
		expect(bounds(out, a).min[2]).toBeGreaterThanOrEqual(0);
		expect(bounds(out, b).min[2]).toBeGreaterThanOrEqual(0);
	});

	it('does not move locked objects', () => {
		const { d, a, b } = twoBoxes();
		const locked = { ...d, nodes: { ...d.nodes, [b]: { ...d.nodes[b]!, locked: true } } };
		const out = alignNodes(locked, [a, b], 'x', 'min');
		expect(bounds(out, b)).toEqual(bounds(locked, b));
	});

	it('moves a group by what it holds', () => {
		const { d, a, b } = twoBoxes();
		const g = groupNodes(d, [a, b]);
		const c = addShape(g.design, 'box', [200, 200], { id: 'c' });
		const out = alignNodes(c.design, [g.id!, c.id], 'x', 'min');
		expect(bounds(out, c.id).min[0]).toBeCloseTo(bounds(out, g.id!).min[0]);
	});
});

describe('flipNodes', () => {
	it('mirrors a single shape about its own centre: bounds stay put', () => {
		const { d, a } = twoBoxes();
		const out = flipNodes(d, [a], 'x');
		expect(out).not.toBe(d);
		expect(bounds(out, a).min[0]).toBeCloseTo(bounds(d, a).min[0]);
		expect(bounds(out, a).max[0]).toBeCloseTo(bounds(d, a).max[0]);
	});

	it('mirrors positions about the middle of the whole selection', () => {
		const { d, a, b } = twoBoxes(); // A -5..5, B 40..60 on x: overall -5..60, mirror line at 27.5
		const out = flipNodes(d, [a, b], 'x');
		expect(bounds(out, a).min[0]).toBeCloseTo(50);
		expect(bounds(out, a).max[0]).toBeCloseTo(60);
		expect(bounds(out, b).min[0]).toBeCloseTo(-5);
		expect(bounds(out, b).max[0]).toBeCloseTo(15);
	});

	it('flipping twice restores the design', () => {
		const { d, a, b } = twoBoxes();
		const rotated = setNodeEuler(d, a, [10, 20, 30]);
		for (const axis of ['x', 'y', 'z'] as const) {
			const back = flipNodes(flipNodes(rotated, [a, b], axis), [a, b], axis);
			for (const id of [a, b]) {
				for (const [i, v] of back.nodes[id]!.transform.entries()) expect(v).toBeCloseTo(rotated.nodes[id]!.transform[i]!, 6);
			}
		}
	});

	it('keeps every transform a proper rotation (determinant +1)', () => {
		const { d, a, b } = twoBoxes();
		const out = flipNodes(setNodeEuler(d, a, [15, 25, 35]), [a, b], 'y');
		for (const id of [a, b]) {
			const m = out.nodes[id]!.transform;
			const det =
				m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
			expect(det).toBeCloseTo(1, 6);
		}
	});

	it('flipping Z keeps the selection within the height it already had', () => {
		const { d, a, b } = twoBoxes();
		const out = flipNodes(d, [a, b], 'z');
		expect(bounds(out, a).min[2]).toBeGreaterThanOrEqual(0);
		expect(bounds(out, b).max[2]).toBeCloseTo(bounds(d, b).max[2]);
	});

	it('mirrors a tipped shape so its world bounds are the reflection', () => {
		const { d, a } = twoBoxes();
		const tipped = setNodeEuler(d, a, [0, 30, 0]);
		const [b0, b1] = [bounds(tipped, a), bounds(flipNodes(tipped, [a], 'x'), a)];
		expect(b1.min[0]).toBeCloseTo(b0.min[0]);
		expect(b1.max[2]).toBeCloseTo(b0.max[2]);
	});

	it('mirrors groups, children included', () => {
		const { d, a, b } = twoBoxes();
		const g = groupNodes(d, [a, b]);
		const before = bounds(g.design, g.id!);
		const out = flipNodes(g.design, [g.id!], 'x');
		const after = bounds(out, g.id!);
		expect(after.min[0]).toBeCloseTo(before.min[0]);
		expect(after.max[0]).toBeCloseTo(before.max[0]);
		// A was on the left, so now it is on the right
		expect(bounds(out, a).min[0]).toBeGreaterThan(bounds(out, b).min[0]);
	});

	it('flips an imported model too, by showing it mirrored (see flipImported.test.ts for the mirror image itself)', () => {
		const { d, a } = twoBoxes();
		const mesh = { ...d.nodes[a]!, shapeType: 'mesh' } as (typeof d.nodes)[string];
		const withMesh = { ...d, nodes: { ...d.nodes, [a]: mesh } };
		const out = flipNodes(withMesh, [a], 'x');
		expect(out).not.toBe(withMesh);
		expect((out.nodes[a] as { params: Record<string, unknown> }).params.mirror).toBe(1);
	});

	it('does nothing with an empty selection', () => {
		const { d } = twoBoxes();
		expect(flipNodes(d, [], 'x')).toBe(d);
	});
});

describe('canAlign / canFlip', () => {
	it('align needs two objects, flip needs one', () => {
		const { d, a, b } = twoBoxes();
		expect(canAlign(d, [a])).toBe(false);
		expect(canAlign(d, [a, b])).toBe(true);
		expect(canFlip(d, [])).toBe(false);
		expect(canFlip(d, [a])).toBe(true);
	});

	it('nothing happens to locked objects, so the buttons stay off', () => {
		const { d, a, b } = twoBoxes();
		const locked = { ...d, nodes: { ...d.nodes, [a]: { ...d.nodes[a]!, locked: true }, [b]: { ...d.nodes[b]!, locked: true } } };
		expect(canAlign(locked, [a, b])).toBe(false);
		expect(canFlip(locked, [a, b])).toBe(false);
	});

	it('flip is on for an imported model', () => {
		const { d, a } = twoBoxes();
		const mesh = { ...d.nodes[a]!, shapeType: 'mesh' } as (typeof d.nodes)[string];
		expect(canFlip({ ...d, nodes: { ...d.nodes, [a]: mesh } }, [a])).toBe(true);
	});
});
