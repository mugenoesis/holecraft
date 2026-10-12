import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design } from './design.ts';
import { duplicateNodes, moveNodes, setNodeEuler } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addShape, nodeBoundsIn, translationOf } from './ops.ts';
import { repeatDuplicate } from './repeat.ts';

const one = () => addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design;
const pos = (d: Design, id: string) => translationOf(d.nodes[id]!.transform);

describe('repeatDuplicate', () => {
	it('applies the move made between the original and its copy once more', () => {
		const first = duplicateNodes(one(), ['a'], [10, 10]);
		const copy = first.ids[0]!;
		const moved = moveNodes(first.design, [copy], [20, -5, 0]); // the copy now sits at (30, 5)
		const again = repeatDuplicate(moved, ['a'], [copy]);
		expect(again.ids).toHaveLength(1);
		expect(pos(again.design, again.ids[0]!)).toEqual([60, 10, 0]);
		expect(Object.keys(again.design.nodes)).toHaveLength(3);
	});

	it('repeats a lift and a turn as well', () => {
		const first = duplicateNodes(one(), ['a'], [0, 0]);
		const copy = first.ids[0]!;
		let d = moveNodes(first.design, [copy], [30, 0, 5]);
		d = setNodeEuler(d, copy, [0, 0, 90]);
		const again = repeatDuplicate(d, ['a'], [copy]);
		const b0 = nodeBoundsIn(d, 'a')!;
		const b1 = nodeBoundsIn(again.design, again.ids[0]!)!;
		// a cube turned a quarter again is still a cube: same size, 30 further along (copy 1 moved from 0 to 30)
		expect(b1.min[2]).toBeCloseTo(10);
		expect(b1.max[2] - b1.min[2]).toBeCloseTo(b0.max[2] - b0.min[2]);
	});

	it('repeats the same steps for several objects and for groups', () => {
		let d = addShape(one(), 'sphere', [50, 0], { id: 'b' }).design;
		const g = groupNodes(d, ['a', 'b']);
		d = g.design;
		const first = duplicateNodes(d, [g.id!], [0, 0]);
		const copy = first.ids[0]!;
		d = moveNodes(first.design, [copy], [0, 40, 0]);
		const again = repeatDuplicate(d, [g.id!], [copy]);
		expect(pos(again.design, again.ids[0]!)).toEqual([0, 80, 0]);
		expect(Object.values(again.design.nodes).filter((n) => n.kind === 'shape')).toHaveLength(6);
	});

	it('falls back to nothing when the original is gone or the lists do not match', () => {
		const first = duplicateNodes(one(), ['a'], [10, 10]);
		expect(repeatDuplicate(first.design, ['gone'], first.ids).ids).toEqual([]);
		expect(repeatDuplicate(first.design, ['a', 'a'], first.ids).ids).toEqual([]);
	});

	it('leaves the design alone when it makes nothing', () => {
		const d = one();
		expect(repeatDuplicate(d, [], []).design).toBe(d);
	});
});
