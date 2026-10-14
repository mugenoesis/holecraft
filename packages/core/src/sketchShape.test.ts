import { describe, expect, it } from 'vitest';
import { flipNodes } from './arrange.ts';
import { createEmptyDesign, DESIGN_FORMAT_VERSION, type Design, type ShapeNode } from './design.ts';
import { duplicateNodes, setShapeSize } from './edit.ts';
import { groupNodes } from './groups.ts';
import { addLibraryShape, libraryShapeOf } from './libraryShape.ts';
import { addShape, shapeBounds } from './ops.ts';
import { filterShapes } from './shapeSearch.ts';
import { getShapeDef, isShapeType } from './shapes.ts';
import { circleOutline, rectangleOutline, type SketchOutline } from './sketch.ts';
import { addSketchShape, setShapeSketch, sketchPolygons, sketchShown } from './sketchShape.ts';
import type { WorkPlane } from './surfacePlane.ts';
import { parseDesign } from './validate.ts';
import { setLocked } from './visibility.ts';

const FLOOR: WorkPlane = { origin: [0, 0, 0], normal: [0, 0, 1] };
const empty = () => createEmptyDesign('d');
const slab = (): SketchOutline[] => [rectangleOutline([10, 0], [30, 20])];
const made = (plane = FLOOR, outlines = slab(), height = 8) => {
	const r = addSketchShape(empty(), plane, outlines, height, { id: 's' });
	if (!r.id) throw new Error('refused');
	return r.design;
};
const node = (d: Design) => d.nodes.s as ShapeNode;
const sizeOf = (d: Design) => [node(d).params.width, node(d).params.depth, node(d).params.height] as number[];

describe('the Sketch shape', () => {
	it('is a known shape that is not a tile in the Shapes panel (a sketch is made by drawing one), however it is searched for', () => {
		expect(isShapeType('sketch')).toBe(true);
		expect(getShapeDef('sketch').name).toBe('Sketch');
		expect(filterShapes('sketch', 'all').map((d) => d.id)).not.toContain('sketch');
		expect(filterShapes('', 'all').map((d) => d.id)).not.toContain('sketch');
		expect(filterShapes('', 'parametric').map((d) => d.id)).not.toContain('sketch');
	});

	it('uses only a default palette colour, so a new sketch sits in a filament slot', () => {
		expect(['#f28c28', '#2a9d8f', '#e76f51', '#8d99ae']).toContain(getShapeDef('sketch').color);
	});
});

describe('addSketchShape', () => {
	it('makes a shape the size of the drawing, thick by the height, with its middle where the drawing’s was, standing on the floor', () => {
		const d = made();
		expect(sizeOf(d)).toEqual([20, 20, 8]);
		const b = shapeBounds(node(d));
		expect(b.min).toEqual([10, 0, 0]);
		expect(b.max).toEqual([30, 20, 8]);
		expect(d.roots).toEqual(['s']);
		expect(node(d).name).toBe('Sketch 1');
	});

	it('keeps the outline centred on the shape’s own origin, so it resizes about its middle', () => {
		const outline = node(made()).sketch!.outlines[0]!;
		expect(outline.points).toEqual([
			[-10, -10],
			[10, -10],
			[10, 10],
			[-10, 10],
		]);
	});

	it('puts a sketch on a wall the way a new shape stands on one: x along the wall, y up it, the thickness going out of it', () => {
		const wall: WorkPlane = { origin: [0, -50, 0], normal: [0, -1, 0] };
		const d = made(wall, [rectangleOutline([0, 5], [20, 25])], 4);
		const b = shapeBounds(node(d));
		// 20 wide along the wall, 20 up it, and out of the wall (y goes from -50 to -54)
		expect(b.max[1]! - b.min[1]!).toBeCloseTo(4, 6);
		expect(b.max[1]).toBeCloseTo(-50, 6);
		expect(b.max[2]! - b.min[2]!).toBeCloseTo(20, 6);
		expect(b.min[2]).toBeCloseTo(5, 6);
		expect(b.max[0]! - b.min[0]!).toBeCloseTo(20, 6);
	});

	it('stands on a face above the floor (the top of another shape), with its base on the face', () => {
		const top: WorkPlane = { origin: [0, 0, 15], normal: [0, 0, 1] };
		const b = shapeBounds(node(made(top, slab(), 5)));
		expect(b.min[2]).toBe(15);
		expect(b.max[2]).toBe(20);
	});

	it('is refused (the same design, no id) for an underside, a drawing with nothing in it, or a height that is not a size', () => {
		const d = empty();
		const under: WorkPlane = { origin: [0, 0, 0], normal: [0, 0, -1] };
		for (const r of [
			addSketchShape(d, under, slab(), 5),
			addSketchShape(d, FLOOR, [], 5),
			addSketchShape(d, FLOOR, slab(), 0),
			addSketchShape(d, FLOOR, slab(), 5000),
			addSketchShape(d, FLOOR, slab(), Number.NaN),
		]) {
			expect(r.id).toBeNull();
			expect(r.design).toBe(d);
		}
	});

	it('is called Sketch 2 when there is already one', () => {
		const first = made();
		const second = addSketchShape(first, FLOOR, slab(), 5, { id: 't' });
		expect(second.design.nodes.t!.name).toBe('Sketch 2');
	});
});

describe('sketchShown: the outlines as they are now, stretched to the shape’s width and depth', () => {
	it('is the stored outlines until the shape is resized, then stretched with it', () => {
		const d = made();
		expect(sketchShown(node(d))).toEqual(node(d).sketch!.outlines);
		const wide = setShapeSize(d, 's', { width: 40 });
		expect(sketchShown(node(wide))[0]!.points[1]).toEqual([20, -10]);
		const deep = setShapeSize(d, 's', { depth: 10 });
		expect(sketchShown(node(deep))[0]!.points[2]).toEqual([10, 5]);
	});

	it('is the mirror image when the shape is flipped (mirror setting), and the stored outlines are not changed by it', () => {
		const lopsided = [
			{
				points: [
					[0, 0],
					[30, 0],
					[0, 10],
				] as [number, number][],
			},
		];
		const d = made(FLOOR, lopsided);
		const stored = JSON.stringify(node(d).sketch);
		const flipped = flipNodes(d, ['s'], 'x');
		expect(node(flipped).params.mirror).toBe(1);
		const [a, b] = [sketchShown(node(d))[0]!.points, sketchShown(node(flipped))[0]!.points];
		for (const [i, p] of a.entries()) expect(b[i]).toEqual([-p[0], p[1]]);
		expect(JSON.stringify(node(flipped).sketch)).toBe(stored);
		expect(node(flipNodes(flipped, ['s'], 'x')).params.mirror).toBeUndefined();
	});
});

describe('setShapeSketch', () => {
	it('keeps the drawing where it was: redrawn with a hole in it, the plate has not moved in the world', () => {
		const d = made(); // a rectangle 10..30 x 0..20 on the floor, which is -10..10 in the shape's own frame
		const redrawn = setShapeSketch(d, 's', [rectangleOutline([-10, -10], [10, 10]), rectangleOutline([-6, -6], [-2, -2])]);
		const b = shapeBounds(node(redrawn));
		expect(b.min).toEqual([10, 0, 0]);
		expect(b.max).toEqual([30, 20, 8]);
		expect(sizeOf(redrawn)).toEqual([20, 20, 8]);
		expect(node(redrawn).sketch!.outlines).toHaveLength(2);
	});

	it('moves with the drawing: new outlines in the shape’s frame are placed by where they are, not recentred in the world', () => {
		const d = made();
		// in the shape's frame the old drawing is -10..10; add a second 10 mm square sticking out to the right (10..20)
		const outlines = [...sketchShown(node(d)), rectangleOutline([10, -5], [20, 5])];
		const grown = setShapeSketch(d, 's', outlines);
		const b = shapeBounds(node(grown));
		expect(b.min[0]).toBeCloseTo(10, 6); // the old left edge has not moved (world x 10)
		expect(b.max[0]).toBeCloseTo(40, 6); // the new square ends at world x 40
		expect(sizeOf(grown)).toEqual([30, 20, 8]);
		expect(node(grown).sketch!.outlines).toHaveLength(2);
	});

	it('takes a new height too, and otherwise keeps it', () => {
		const d = made();
		expect(node(setShapeSketch(d, 's', sketchShown(node(d)), { height: 12 })).params.height).toBe(12);
		expect(node(setShapeSketch(d, 's', [rectangleOutline([0, 0], [4, 4])])).params.height).toBe(8);
	});

	it('bakes in what the shape was stretched to and drops the flip setting: the drawing edited is the drawing seen', () => {
		let d = setShapeSize(made(), 's', { width: 40 });
		d = flipNodes(d, ['s'], 'x');
		const edited = setShapeSketch(d, 's', sketchShown(node(d)));
		expect(node(edited).params.mirror).toBeUndefined();
		expect(sizeOf(edited)).toEqual([40, 20, 8]);
		expect(node(edited).sketch!.outlines[0]!.points[1]).toEqual([-20, -10]); // mirrored and stretched, now stored as it is
	});

	it('is one change, the same design when nothing changed, and refused for a locked or other shape or a drawing with nothing in it', () => {
		const d = made();
		expect(setShapeSketch(d, 's', sketchShown(node(d)))).toBe(d);
		const locked = setLocked(d, ['s'], true);
		expect(setShapeSketch(locked, 's', slab())).toBe(locked);
		expect(setShapeSketch(d, 's', [])).toBe(d);
		expect(setShapeSketch(d, 'nope', slab())).toBe(d);
	});
});

describe('saving and copying a sketch', () => {
	it('keeps the drawing through saving and reading back, and the format is 5', () => {
		expect(DESIGN_FORMAT_VERSION).toBeGreaterThanOrEqual(5); // sketches came in with format 5
		const d = made(FLOOR, [rectangleOutline([0, 0], [20, 20]), rectangleOutline([5, 5], [10, 10])]);
		const back = parseDesign(JSON.parse(JSON.stringify(d)));
		expect((back.nodes.s as ShapeNode).sketch).toEqual(node(d).sketch);
	});

	it('is refused when the file has no drawing, or a drawing that is not one', () => {
		const raw = JSON.parse(JSON.stringify(made()));
		const bad = (change: (n: Record<string, unknown>) => void) => {
			const copy = JSON.parse(JSON.stringify(raw));
			change(copy.nodes.s);
			return () => parseDesign(copy);
		};
		expect(bad((n) => delete n.sketch)).toThrow(/sketch/);
		expect(bad((n) => (n.sketch = { outlines: [] }))).toThrow(/outline/);
		expect(
			bad(
				(n) =>
					(n.sketch = {
						outlines: [
							{
								points: [
									[0, 0],
									[1, 1],
								],
							},
						],
					}),
			),
		).toThrow(/points/);
		expect(
			bad(
				(n) =>
					(n.sketch = {
						outlines: [
							{
								points: [
									[0, 0],
									[1, Number.NaN],
									[2, 2],
								],
							},
						],
					}),
			),
		).toThrow(/point/);
		expect(
			bad(
				(n) =>
					(n.sketch = {
						outlines: Array.from({ length: 65 }, () => ({
							points: [
								[0, 0],
								[1, 0],
								[0, 1],
							],
						})),
					}),
			),
		).toThrow(/outlines/);
		expect(bad((n) => (n.sketch = 'no'))).toThrow(/sketch/);
		expect(bad(() => {})).not.toThrow();
	});

	it('drops a sketch field from a shape that is not a sketch (it does nothing there)', () => {
		const d = createEmptyDesign('d');
		const raw = JSON.parse(
			JSON.stringify({
				...d,
				nodes: {
					b: {
						id: 'b',
						kind: 'shape',
						shapeType: 'box',
						name: 'Box 1',
						transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
						mode: 'solid',
						color: '#f28c28',
						hidden: false,
						locked: false,
						params: { width: 10, depth: 10, height: 10 },
						sketch: { outlines: [] },
					},
				},
				roots: ['b'],
			}),
		);
		expect('sketch' in (parseDesign(raw).nodes.b as object)).toBe(false);
	});

	it('copies with the shape when it is duplicated', () => {
		const d = made();
		const { design, ids } = duplicateNodes(d, ['s'], [10, 10]);
		expect((design.nodes[ids[0]!] as ShapeNode).sketch).toEqual(node(d).sketch);
		expect(design.nodes[ids[0]!]!.name).toBe('Sketch 2');
	});
});

describe('a sketch in the library and in groups', () => {
	it('is kept whole when saved to the library and added again, as a new copy with the same drawing', () => {
		const d = made(FLOOR, [rectangleOutline([0, 0], [20, 20]), rectangleOutline([5, 5], [10, 10])]);
		const saved = libraryShapeOf(d, 's', 'My plate')!;
		expect(saved).not.toBeNull();
		expect(parseDesign(JSON.parse(JSON.stringify(saved)))).toBeTruthy();
		const added = addLibraryShape(empty(), saved, { at: [50, 0] });
		const copy = Object.values(added.design.nodes).find((n) => n.kind === 'shape' && n.shapeType === 'sketch') as ShapeNode;
		expect(copy.sketch).toEqual(node(d).sketch);
		expect(copy.id).not.toBe('s');
	});

	it('can be grouped with another shape, and keeps its drawing', () => {
		const d = made();
		const withBox = addShape(d, 'box', [60, 0], { id: 'b' }).design;
		const grouped = groupNodes(withBox, ['s', 'b'], { id: 'g' }).design;
		expect((grouped.nodes.s as ShapeNode).sketch).toEqual(node(d).sketch);
		expect(grouped.nodes.g!.kind).toBe('group');
	});
});

describe('a sketch with curves', () => {
	const disc = () => made(FLOOR, [circleOutline([30, 20], 10)], 6);
	const dShape = (): SketchOutline[] => [
		{
			points: [
				[0, 0],
				[20, 0],
			],
			segments: [1, 'line'],
		},
	];

	it('is boxed by its curve: a circle of radius 10 makes a 20 x 20 shape, and a D of width 20 is 20 x 10', () => {
		expect(sizeOf(disc())).toEqual([expect.closeTo(20, 6), expect.closeTo(20, 1), 6]);
		const d = made(FLOOR, dShape(), 4);
		expect(node(d).params.width).toBeCloseTo(20, 6);
		expect(node(d).params.depth).toBeCloseTo(10, 1);
	});

	it('keeps its sides with the drawing, and stands where it was drawn: the circle’s middle is at (30, 20)', () => {
		const d = disc();
		expect(node(d).sketch!.outlines[0]!.segments).toEqual([1, 1]);
		const b = shapeBounds(node(d));
		expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(30, 6);
		expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(20, 1);
	});

	it('shows the same sides stretched with the shape, and an arc keeps its bulge', () => {
		const wide = setShapeSize(disc(), 's', { width: 40 });
		const shown = sketchShown(node(wide))[0]!;
		expect(shown.segments).toEqual([1, 1]);
		expect(shown.points[1]![0]).toBeCloseTo(20, 6);
	});

	it('shows a flipped arc bent the other way (a mirror image), and a smooth curve as it was', () => {
		const d = made(
			FLOOR,
			[
				{
					points: [
						[0, 0],
						[20, 0],
						[10, 15],
					],
					segments: [0.5, 'curve', 'line'],
				},
			],
			3,
		);
		const flipped = flipNodes(d, ['s'], 'x');
		const [a, b] = [sketchShown(node(d))[0]!, sketchShown(node(flipped))[0]!];
		expect(b.segments![0]).toBeCloseTo(-0.5, 9);
		expect(b.segments![1]).toBe('curve');
		expect(b.segments![2]).toBe('line');
		for (const [i, p] of a.points.entries()) expect(b.points[i]![0]).toBeCloseTo(-p[0], 9);
	});

	it('is built as the exact stretch of the curve: a circle made twice as wide is an ellipse, points all on it', () => {
		const wide = setShapeSize(disc(), 's', { width: 40 });
		const polygons = sketchPolygons(node(wide));
		for (const [x, y] of polygons[0]!) expect(Math.abs((x / 20) ** 2 + (y / 10) ** 2 - 1)).toBeLessThan(0.002);
		expect(polygons[0]!.length).toBeGreaterThan(30);
	});

	it('is built from the straight points when there are no curves, and mirrored when flipped', () => {
		const d = made();
		expect(sketchPolygons(node(d))[0]).toEqual(node(d).sketch!.outlines[0]!.points);
		const triangle = made(FLOOR, [
			{
				points: [
					[0, 0],
					[30, 0],
					[0, 10],
				],
			},
		]);
		const flipped = flipNodes(triangle, ['s'], 'x');
		const [a, b] = [sketchPolygons(node(triangle))[0]!, sketchPolygons(node(flipped))[0]!];
		for (const [i, p] of a.entries()) expect(b[i]).toEqual([-p[0] + 0, p[1]]);
	});

	it('is redrawn with its curves kept, and where it was in the world', () => {
		const d = disc();
		const redrawn = setShapeSketch(d, 's', [...sketchShown(node(d)), rectangleOutline([-3, -3], [3, 3])]);
		expect(node(redrawn).sketch!.outlines[0]!.segments).toEqual([1, 1]);
		expect(node(redrawn).sketch!.outlines).toHaveLength(2);
		const b = shapeBounds(node(redrawn));
		expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(30, 6);
	});

	it('is saved and read back with its sides, and a file with a side that is not one is refused', () => {
		const d = made(
			FLOOR,
			[
				{
					points: [
						[0, 0],
						[20, 0],
						[10, 15],
					],
					segments: [0.5, 'curve', 'line'],
				},
			],
			3,
		);
		expect((parseDesign(JSON.parse(JSON.stringify(d))).nodes.s as ShapeNode).sketch).toEqual(node(d).sketch);
		const bad = (change: (o: Record<string, unknown>) => void) => {
			const raw = JSON.parse(JSON.stringify(d));
			change(raw.nodes.s.sketch.outlines[0]);
			return () => parseDesign(raw);
		};
		expect(bad((o) => (o.segments = [0.5, 'curve']))).toThrow(/segments/); // one per point
		expect(bad((o) => (o.segments = [0.5, 'wiggle', 'line']))).toThrow(/side/);
		expect(bad((o) => (o.segments = [9, 'curve', 'line']))).toThrow(/side/);
		expect(bad((o) => (o.segments = [Number.NaN, 'curve', 'line']))).toThrow(/side/);
		expect(bad(() => {})).not.toThrow();
		expect(
			bad((o) => {
				o.points = [
					[0, 0],
					[10, 0],
				];
				o.segments = ['line', 'line'];
			}),
		).toThrow(/points/);
	});

	it('may have two points when a side is curved (a D, a circle), and not otherwise', () => {
		const raw = JSON.parse(JSON.stringify(made(FLOOR, dShape(), 3)));
		expect(() => parseDesign(raw)).not.toThrow();
		raw.nodes.s.sketch.outlines[0].segments = ['line', 'line'];
		expect(() => parseDesign(raw)).toThrow(/points/);
	});

	it('is the format 6', () => {
		expect(DESIGN_FORMAT_VERSION).toBe(6);
	});
});
