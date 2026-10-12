import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type Design, type EdgeTreatment, type ShapeNode } from './design.ts';
import { setEdgeTreatments, stretchTreatments } from './edgeEdits.ts';
import { setShapeGeometry, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { groupGeometry, setGroupGeometry } from './groupTransform.ts';
import { addShape, nodeBoundsIn } from './ops.ts';

/** The top front edge of a 20 mm box at the origin, in the box's own frame: faces up (+z) and forward (-y). */
const TOP_FRONT: EdgeTreatment = {
	id: 'e1',
	kind: 'chamfer',
	size: 2,
	points: [
		[-10, -10, 20],
		[10, -10, 20],
	],
	normals: [
		[
			[0, 0, 1],
			[0, -1, 0],
		],
	],
};

describe('stretchTreatments', () => {
	it('stretches the points along each axis and leaves the size alone (a 2 mm chamfer stays 2 mm)', () => {
		const [t] = stretchTreatments([TOP_FRONT], [2, 3, 0.5], null)!;
		expect(t!.points).toEqual([
			[-20, -30, 10],
			[20, -30, 10],
		]);
		expect(t!.size).toBe(2);
		expect(t!.id).toBe('e1');
		expect(t!.kind).toBe('chamfer');
	});

	it('adds a shift only when one is given', () => {
		const [t] = stretchTreatments([TOP_FRONT], [1, 1, 1], [5, 0, -1])!;
		expect(t!.points[0]).toEqual([-5, -10, 19]);
	});

	it('turns the face directions the way a stretched surface turns: by the inverse of the stretch, then back to length 1', () => {
		// a face leaning at 45 degrees (normal along (1, 1, 0)) in a shape stretched twice as long in x leans less: its normal swings towards x
		const leaning: EdgeTreatment = {
			...TOP_FRONT,
			normals: [
				[
					[Math.SQRT1_2, Math.SQRT1_2, 0],
					[0, 0, 1],
				],
			],
		};
		const [t] = stretchTreatments([leaning], [2, 1, 1], null)!;
		const [n] = t!.normals[0]!;
		expect(Math.hypot(...n)).toBeCloseTo(1, 9);
		expect(n[0] / n[1]).toBeCloseTo(0.5, 9); // (1/2, 1)
		// a face along an axis stays along it
		expect(t!.normals[0]![1]).toEqual([0, 0, 1]);
	});

	it('gives nothing back for nothing, and the same list when nothing changes', () => {
		expect(stretchTreatments(undefined, [2, 2, 2], null)).toBeUndefined();
		const list = [TOP_FRONT];
		expect(stretchTreatments(list, [1, 1, 1], null)).toBe(list);
	});

	it('does not change the treatments it was given', () => {
		const before = JSON.stringify(TOP_FRONT);
		stretchTreatments([TOP_FRONT], [2, 3, 4], [1, 1, 1]);
		expect(JSON.stringify(TOP_FRONT)).toBe(before);
	});
});

const treated = (d: Design, id: string) => (d.nodes[id] as { edges?: EdgeTreatment[] }).edges;

describe('resizing a shape keeps its treatments on its edges', () => {
	const box = () => setEdgeTreatments(addShape(createEmptyDesign('d'), 'box', [0, 0], { id: 'a' }).design, 'a', [TOP_FRONT]);

	it('typing a new size (width 20 to 40, height 20 to 10)', () => {
		const d = setShapeSize(box(), 'a', { width: 40, height: 10 });
		expect(treated(d, 'a')![0]!.points).toEqual([
			[-20, -10, 10],
			[20, -10, 10],
		]);
	});

	it('dragging a handle (the whole geometry at once)', () => {
		const g = { x: 0, y: 0, z: 0, width: 30, depth: 20, height: 40 };
		const d = setShapeGeometry(box(), 'a', g);
		expect(treated(d, 'a')![0]!.points).toEqual([
			[-15, -10, 40],
			[15, -10, 40],
		]);
	});

	it('moving a shape without resizing it leaves them alone', () => {
		const d = box();
		const moved = setShapeGeometry(d, 'a', { x: 30, y: 0, z: 0, width: 20, depth: 20, height: 20 });
		expect(treated(moved, 'a')).toEqual([TOP_FRONT]);
	});
});

describe('resizing a group keeps its treatments, and those inside it, on their edges', () => {
	/** Two 20 mm boxes side by side, grouped: 40 x 20 x 20 from x = -10 to 30. The group's own treatment is its top front edge. */
	function bar(): Design {
		let d = createEmptyDesign('d');
		d = addShape(d, 'box', [0, 0], { id: 'a' }).design;
		d = addShape(d, 'box', [20, 0], { id: 'b' }).design;
		d = groupNodes(d, ['a', 'b'], { id: 'g' }).design;
		const edge: EdgeTreatment = {
			...TOP_FRONT,
			points: [
				[-10, -10, 20],
				[30, -10, 20],
			],
		};
		d = setEdgeTreatments(d, 'g', [edge]);
		return setEdgeTreatments(d, 'a', [TOP_FRONT]);
	}

	it('stretches the group’s own treatment with its contents (60 wide instead of 40, 10 tall instead of 20)', () => {
		const d = bar();
		const g = groupGeometry(d, 'g')!;
		const resized = setGroupGeometry(d, 'g', { ...g, width: 60, height: 10 });
		expect(resized).not.toBe(d);
		const b = nodeBoundsIn(resized, 'g')!;
		const [t] = treated(resized, 'g')!;
		// the edge runs along the new top front of the bar, wherever the bar now is
		expect(t!.points[0]![0]).toBeCloseTo(b.min[0], 6);
		expect(t!.points[1]![0]).toBeCloseTo(b.max[0], 6);
		expect(t!.points[0]![2]).toBeCloseTo(b.max[2], 6);
		expect(t!.points[0]![1]).toBeCloseTo(b.min[1], 6);
	});

	it('stretches a shape inside the group along the axes it lines up with', () => {
		const d = bar();
		const g = groupGeometry(d, 'g')!;
		const resized = setGroupGeometry(d, 'g', { ...g, width: 60, height: 10 });
		const a = resized.nodes.a as ShapeNode;
		const [t] = treated(resized, 'a')!;
		// box a was 20 wide and 20 tall; it is now stretched by 1.5 along x and 0.5 along z, and so is its treatment
		expect(a.params.width).toBeCloseTo(30, 6);
		expect(a.params.height).toBeCloseTo(10, 6);
		expect(t!.points).toEqual([
			[-15, -10, 10],
			[15, -10, 10],
		]);
	});

	it('moves the group’s own treatment with its contents when the group is only moved (the contents shift inside the group’s frame), and leaves a shape’s own alone', () => {
		const d = bar();
		const g = groupGeometry(d, 'g')!;
		const moved = setGroupGeometry(d, 'g', { ...g, x: g.x + 25 });
		const [before] = treated(d, 'g')!;
		const [after] = treated(moved, 'g')!;
		const b0 = nodeBoundsIn(d, 'g')!;
		const b1 = nodeBoundsIn(moved, 'g')!;
		const shift = b1.min[0] - b0.min[0];
		expect(Math.abs(shift)).toBeGreaterThan(1);
		expect(after!.points[0]![0]).toBeCloseTo(before!.points[0]![0] + shift, 6); // it moved by exactly what the bar moved by
		expect(after!.points[0]![1]).toBeCloseTo(before!.points[0]![1], 6);
		expect(treated(moved, 'a')).toEqual(treated(d, 'a')); // a shape's treatments are in its own frame, which moved with it
	});
});
