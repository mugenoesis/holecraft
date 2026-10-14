import { describe, expect, it } from 'vitest';
import { circleOutline, outlineArea, rectangleOutline, type SketchOutline, type SketchPoint } from './sketch.ts';
import { segmentMidpoint } from './sketchCurves.ts';
import {
	createSketchEditor,
	draftArc,
	draftLine,
	draftOutline,
	draftSpline,
	MAX_SIDES,
	MIN_SIDES,
	outlineHandles,
	type SketchAction,
	type SketchEditorState,
	selectedOutline,
	sketchReducer,
} from './sketchEditor.ts';

const close2 = (got: readonly number[], want: readonly number[]) => {
	for (const [i, v] of got.entries()) expect(v).toBeCloseTo(want[i]!, 6);
};
const REACH = 0.8; // how close (mm) a press must be to a point to hit it
const run = (state: SketchEditorState, ...actions: SketchAction[]) => actions.reduce(sketchReducer, state);
const start = (over: Partial<SketchEditorState> = {}) => ({ ...createSketchEditor(), snap: 1, ...over });
const down = (at: SketchPoint): SketchAction => ({ type: 'down', at, reach: REACH });
const move = (at: SketchPoint): SketchAction => ({ type: 'move', at, reach: REACH });
const up = (at: SketchPoint): SketchAction => ({ type: 'up', at });
const drag = (from: SketchPoint, to: SketchPoint): SketchAction[] => [down(from), move(to), up(to)];
const click = (at: SketchPoint): SketchAction[] => [down(at), up(at)];
const key = (k: string, extra: Partial<Extract<SketchAction, { type: 'key' }>> = {}): SketchAction => ({ type: 'key', key: k, ...extra });
const draw = (tool: 'rectangle' | 'circle' | 'polygon', from: SketchPoint, to: SketchPoint, over: Partial<SketchEditorState> = {}) =>
	run(start({ tool, ...over }), ...drag(from, to));
const square = (x: number, y: number, size: number): SketchOutline => rectangleOutline([x, y], [x + size, y + size]);

describe('drawing a rectangle', () => {
	it('is made by dragging from one corner to the opposite one, whichever way', () => {
		for (const [a, b] of [
			[
				[0, 0],
				[20, 10],
			],
			[
				[20, 10],
				[0, 0],
			],
			[
				[20, 0],
				[0, 10],
			],
		] as [SketchPoint, SketchPoint][]) {
			const s = draw('rectangle', a, b);
			expect(s.outlines).toHaveLength(1);
			expect(outlineArea(s.outlines[0]!)).toBe(200);
		}
	});

	it('shows the rectangle while it is being dragged, and nothing is kept until the button is let go', () => {
		const s = run(start({ tool: 'rectangle' }), down([0, 0]), move([8, 6]));
		expect(s.outlines).toHaveLength(0);
		expect(outlineArea(draftOutline(s)!)).toBe(48);
		expect(draftOutline(run(s, up([8, 6])))).toBeNull();
	});

	it('snaps its corners to the grid (measured from the plane’s origin), and not at all when snap is off', () => {
		expect(draw('rectangle', [0.4, 0.4], [20.6, 10.2]).outlines[0]!.points[2]).toEqual([21, 10]);
		const free = draw('rectangle', [0.4, 0.4], [20.6, 10.2], { snap: 0 });
		expect(free.outlines[0]!.points[0]).toEqual([0.4, 0.4]);
		expect(free.outlines[0]!.points[2]).toEqual([20.6, 10.2]);
		expect(draw('rectangle', [0, 0], [23, 7], { snap: 5 }).outlines[0]!.points[2]).toEqual([25, 5]);
	});

	it('is dropped when it has no size: a click, or a drag along a line', () => {
		expect(run(start({ tool: 'rectangle' }), ...click([5, 5])).outlines).toHaveLength(0);
		expect(draw('rectangle', [0, 0], [10, 0]).outlines).toHaveLength(0);
	});
});

describe('drawing a circle', () => {
	it('is made by dragging from its centre out to its edge: a round polygon of that radius', () => {
		const s = draw('circle', [10, 10], [15, 10]);
		const c = s.outlines[0]!;
		for (const [x, y] of c.points) expect(Math.hypot(x - 10, y - 10)).toBeCloseTo(5, 9);
		expect(outlineArea(c)).toBeGreaterThan(Math.PI * 25 * 0.99);
	});

	it('takes the centre and the radius from the snapped points', () => {
		const s = draw('circle', [10.3, 9.8], [15.2, 10.1]);
		for (const [x, y] of s.outlines[0]!.points) expect(Math.hypot(x - 10, y - 10)).toBeCloseTo(5, 9);
	});

	it('is dropped when the radius is nothing', () => {
		expect(draw('circle', [10, 10], [10, 10]).outlines).toHaveLength(0);
	});
});

describe('drawing a polygon', () => {
	it('is made by dragging from its centre to a corner, with the number of sides from the setting', () => {
		const s = draw('polygon', [0, 0], [10, 0], { sides: 6 });
		const p = s.outlines[0]!.points;
		expect(p).toHaveLength(6);
		expect(p[0]![0]).toBeCloseTo(10, 9);
		expect(p[0]![1]).toBeCloseTo(0, 9);
		for (const [x, y] of p) expect(Math.hypot(x, y)).toBeCloseTo(10, 9);
		expect(draw('polygon', [0, 0], [0, 10], { sides: 3 }).outlines[0]!.points).toHaveLength(3);
	});

	it('keeps the number of sides between 3 and 32, as a whole number', () => {
		expect(MIN_SIDES).toBe(3);
		expect(MAX_SIDES).toBe(32);
		expect(run(start(), { type: 'sides', sides: 1 }).sides).toBe(3);
		expect(run(start(), { type: 'sides', sides: 99 }).sides).toBe(32);
		expect(run(start(), { type: 'sides', sides: 7.6 }).sides).toBe(8);
		expect(run(start(), { type: 'sides', sides: Number.NaN }).sides).toBe(start().sides);
	});
});

describe('drawing with lines', () => {
	const polyline = (...points: SketchPoint[]) => run(start({ tool: 'line' }), ...points.flatMap(click));

	it('adds a point at each click, shows the line with a rubber band to the pointer, and keeps nothing until it is closed', () => {
		const s = run(polyline([0, 0], [10, 0], [10, 10]), move([3.4, 4.6]));
		expect(s.outlines).toHaveLength(0);
		expect(draftLine(s)).toEqual({
			points: [
				[0, 0],
				[10, 0],
				[10, 10],
			],
			hover: [3, 5],
		});
	});

	it('is closed by clicking on its first point (within reach), making an outline of the points', () => {
		const s = run(polyline([0, 0], [10, 0], [10, 10]), ...click([0.3, 0.2]));
		expect(s.outlines).toHaveLength(1);
		expect(s.outlines[0]!.points).toEqual([
			[0, 0],
			[10, 0],
			[10, 10],
		]);
		expect(draftLine(s)).toBeNull();
	});

	it('is closed by Enter too, once it has three points, and Enter does nothing before that', () => {
		expect(run(polyline([0, 0], [10, 0], [10, 10]), key('Enter')).outlines).toHaveLength(1);
		const two = run(polyline([0, 0], [10, 0]), key('Enter'));
		expect(two.outlines).toHaveLength(0);
		expect(draftLine(two)!.points).toHaveLength(2);
	});

	it('is not closed by a click on the first point when it has fewer than three points: that is just a second point on top of the first, which is ignored', () => {
		const s = polyline([0, 0], [0.2, 0.1]);
		expect(s.outlines).toHaveLength(0);
		expect(draftLine(s)!.points).toEqual([[0, 0]]);
	});

	it('ignores a click on the point just placed, so a double click does not make a double point', () => {
		expect(draftLine(polyline([0, 0], [5, 0], [5, 0]))!.points).toEqual([
			[0, 0],
			[5, 0],
		]);
	});

	it('takes the last point back with Backspace, and the whole line with Escape', () => {
		const s = run(polyline([0, 0], [10, 0], [10, 10]), key('Backspace'));
		expect(draftLine(s)!.points).toEqual([
			[0, 0],
			[10, 0],
		]);
		expect(draftLine(run(s, key('Backspace'), key('Backspace')))).toBeNull();
		expect(draftLine(run(s, key('Escape')))).toBeNull();
	});

	it('is cancelled by changing tool, and the draft does not become part of the undo history', () => {
		const s = run(polyline([0, 0], [10, 0], [10, 10]), { type: 'tool', tool: 'rectangle' });
		expect(draftLine(s)).toBeNull();
		expect(s.outlines).toHaveLength(0);
		expect(run(s, { type: 'undo' })).toEqual(s);
	});

	it('stops at the most points an outline may have', () => {
		const points = Array.from({ length: 520 }, (_, i) => [i, (i % 2) * 5] as SketchPoint);
		expect(draftLine(polyline(...points))!.points).toHaveLength(512);
	});
});

describe('selecting and editing', () => {
	const two = () => {
		let s = run(start({ tool: 'rectangle' }), ...drag([0, 0], [20, 20]), ...drag([5, 5], [10, 10]));
		s = run(s, { type: 'tool', tool: 'select' });
		return s;
	};

	it('a click selects the smallest outline there, so a hole inside a plate is reachable, and a click on nothing clears it', () => {
		let s = run(two(), ...click([7, 7]));
		expect(s.selected).toEqual({ outline: 1 });
		s = run(s, ...click([15, 15]));
		expect(s.selected).toEqual({ outline: 0 });
		s = run(s, ...click([50, 50]));
		expect(s.selected).toBeNull();
		expect(selectedOutline(run(two(), ...click([7, 7])))).toEqual(square(5, 5, 5));
	});

	it('dragging a point of the selected outline moves just that point, snapped, and it is one undo step', () => {
		let s = run(two(), ...click([15, 15])); // the plate
		s = run(s, ...drag([20, 20], [24.4, 26.6]));
		expect(s.outlines[0]!.points[2]).toEqual([24, 27]);
		expect(s.outlines[0]!.points[0]).toEqual([0, 0]);
		expect(s.selected).toEqual({ outline: 0, point: 2 });
		expect(run(s, { type: 'undo' }).outlines[0]!.points[2]).toEqual([20, 20]);
	});

	it('dragging the body of an outline moves the whole outline, and a click without a drag changes nothing and adds no undo step', () => {
		const s = run(two(), ...drag([7, 7], [10, 12]));
		expect(s.outlines[1]!.points).toEqual(square(8, 10, 5).points);
		expect(s.outlines[0]!.points).toEqual(square(0, 0, 20).points);
		const before = run(two(), ...click([7, 7]));
		expect(run(before, { type: 'undo' }).outlines).toHaveLength(1); // the undo took back the second rectangle: the click made no step
	});

	it('moves a whole outline by whole grid steps when snapping, so it stays on the grid, and by exactly the drag when not', () => {
		const snapped = run(two(), ...drag([7, 7], [10.4, 12.2]));
		expect(snapped.outlines[1]!.points[0]).toEqual([8, 10]);
		const free = run({ ...two(), snap: 0 }, ...drag([7, 7], [10.4, 12.2]));
		expect(free.outlines[1]!.points[0]![0]).toBeCloseTo(8.4, 9);
		expect(free.outlines[1]!.points[0]![1]).toBeCloseTo(10.2, 9);
	});

	it('gives a point back where it was when Escape is pressed during its drag', () => {
		const s = run(two(), ...click([15, 15]), down([20, 20]), move([30, 30]), key('Escape'));
		expect(s.outlines[0]!.points[2]).toEqual([20, 20]);
		expect(s.draft).toBeNull();
	});

	it('Delete takes away the selected outline, or just the selected point while the outline keeps three or more', () => {
		let s = run(two(), ...click([7, 7]), key('Delete'));
		expect(s.outlines).toHaveLength(1);
		expect(s.selected).toBeNull();
		s = run(two(), ...click([15, 15]), ...click([20, 20]), key('Delete'));
		expect(s.outlines[0]!.points).toHaveLength(3);
		expect(s.selected).toEqual({ outline: 0 }); // the outline stays selected, and a second Delete (no point selected now) takes all of it
		expect(run(s, key('Delete')).outlines).toHaveLength(1);
	});

	it('Delete on a triangle’s point takes the whole triangle (it could not be one with two points)', () => {
		let s = run(start({ tool: 'polygon', sides: 3 }), ...drag([0, 0], [10, 0]));
		s = run(s, { type: 'tool', tool: 'select' }, ...click([3, 1]), ...click([10, 0]), key('Delete'));
		expect(s.outlines).toHaveLength(0);
	});

	it('Backspace deletes too while nothing is being drawn', () => {
		expect(run(two(), ...click([7, 7]), key('Backspace')).outlines).toHaveLength(1);
	});
});

describe('undo and redo', () => {
	it('takes back one drawn outline at a time and puts it back again, and a new edit forgets what was undone', () => {
		let s = run(start({ tool: 'rectangle' }), ...drag([0, 0], [10, 10]), ...drag([20, 0], [30, 10]));
		expect(s.outlines).toHaveLength(2);
		s = run(s, { type: 'undo' });
		expect(s.outlines).toHaveLength(1);
		s = run(s, { type: 'redo' });
		expect(s.outlines).toHaveLength(2);
		s = run(s, { type: 'undo' }, { type: 'undo' }, ...drag([40, 0], [50, 10]));
		expect(s.outlines).toHaveLength(1);
		expect(run(s, { type: 'redo' }).outlines).toHaveLength(1);
		expect(run(s, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }).outlines).toHaveLength(0);
	});

	it('works from the keyboard: Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y for redo', () => {
		let s = run(start({ tool: 'rectangle' }), ...drag([0, 0], [10, 10]));
		s = run(s, key('z', { ctrl: true }));
		expect(s.outlines).toHaveLength(0);
		expect(run(s, key('z', { ctrl: true, shift: true })).outlines).toHaveLength(1);
		expect(run(s, key('y', { ctrl: true })).outlines).toHaveLength(1);
	});
});

describe('the editor’s limits and setup', () => {
	it('starts with the outlines it is given (editing a sketch), none of them selected, and nothing to undo', () => {
		const s = createSketchEditor([square(0, 0, 10)]);
		expect(s.outlines).toEqual([square(0, 0, 10)]);
		expect(s.selected).toBeNull();
		expect(run(s, { type: 'undo' }).outlines).toEqual([square(0, 0, 10)]);
	});

	it('keeps no more than 64 outlines: a 65th is refused', () => {
		let s = start({ tool: 'rectangle' });
		for (let i = 0; i < 66; i++) s = run(s, ...drag([i * 3, 0], [i * 3 + 2, 2]));
		expect(s.outlines).toHaveLength(64);
	});

	it('turns the snap on and off with a size, and ignores a size that is not a number or is negative', () => {
		expect(run(start(), { type: 'snap', snap: 5 }).snap).toBe(5);
		expect(run(start(), { type: 'snap', snap: 0 }).snap).toBe(0);
		expect(run(start(), { type: 'snap', snap: -1 }).snap).toBe(1);
		expect(run(start(), { type: 'snap', snap: Number.NaN }).snap).toBe(1);
	});

	it('does not change the outlines it was given', () => {
		const given = [square(0, 0, 10)];
		const copy = JSON.stringify(given);
		const s = run(createSketchEditor(given), { type: 'tool', tool: 'select' }, ...drag([0, 0], [4, 4]));
		expect(s.outlines[0]!.points[0]).toEqual([4, 4]);
		expect(JSON.stringify(given)).toBe(copy);
	});
});

describe('the Arc tool', () => {
	const arcs = (...points: SketchPoint[]) => run(start({ tool: 'arc' }), ...points.flatMap(click));

	it('takes the start, a point the arc passes through and then its end, and shows the arc so far while it is drawn', () => {
		const s = arcs([-10, 0], [0, -10], [10, 0]);
		expect(s.outlines).toHaveLength(0);
		const draft = draftArc(s)!;
		expect(draft.points).toEqual([
			[-10, 0],
			[10, 0],
		]);
		expect(draft.bulges).toHaveLength(1);
		expect(draft.bulges[0]).toBeCloseTo(1, 9); // a half circle below the chord, anticlockwise
		expect(draft.through).toBeNull();
		expect(draft.placed.length).toBeGreaterThan(10); // the arc as points to draw
	});

	it('shows the next arc as the pointer moves: a line to the pointer until a point to pass through is clicked, then the arc through it', () => {
		let s = run(arcs([-10, 0], [0, -10], [10, 0]), move([20, 10]));
		expect(draftArc(s)!.preview).toEqual([
			[10, 0],
			[20, 10],
		]);
		s = run(s, ...click([15, 10]), move([20, 0]));
		const draft = draftArc(s)!;
		expect(draft.through).toEqual([15, 10]);
		expect(draft.preview!.length).toBeGreaterThan(3);
		expect(draft.preview![0]).toEqual([10, 0]);
		expect(draft.preview![draft.preview!.length - 1]).toEqual([20, 0]);
	});

	it('closes with a straight side on Enter: a start, a point through and an end make a D', () => {
		const s = run(arcs([-10, 0], [0, -10], [10, 0]), key('Enter'));
		expect(s.outlines).toHaveLength(1);
		const o = s.outlines[0]!;
		expect(o.points).toEqual([
			[-10, 0],
			[10, 0],
		]);
		expect(o.segments![0]).toBeCloseTo(1, 9);
		expect(o.segments![1]).toBe('line');
		expect(outlineArea(o)).toBeGreaterThan((Math.PI * 100) / 2 - 3);
		expect(draftArc(s)).toBeNull();
	});

	it('closes with an arc by clicking back on the first point after a point to pass through: a circle from two arcs', () => {
		const s = run(arcs([-10, 0], [0, -10], [10, 0]), ...click([0, 10]), ...click([-10.3, 0.2]));
		expect(s.outlines).toHaveLength(1);
		const o = s.outlines[0]!;
		expect(o.points).toEqual([
			[-10, 0],
			[10, 0],
		]);
		expect(o.segments![0]).toBeCloseTo(1, 9);
		expect(o.segments![1]).toBeCloseTo(1, 9);
		expect(outlineArea(o)).toBeGreaterThan(Math.PI * 100 * 0.99);
	});

	it('chains arcs: each next arc starts where the last ended', () => {
		const s = arcs([0, 0], [5, -3], [10, 0], [15, 3], [20, 0]);
		const d = draftArc(s)!;
		expect(d.points).toEqual([
			[0, 0],
			[10, 0],
			[20, 0],
		]);
		expect(d.bulges).toHaveLength(2);
		expect(Math.sign(d.bulges[0]!)).toBe(1);
		expect(Math.sign(d.bulges[1]!)).toBe(-1);
	});

	it('takes the point to pass through back first with Backspace, then the last arc, then the whole path; Escape cancels it all', () => {
		let s = arcs([0, 0], [5, -3], [10, 0], [15, 3]);
		expect(draftArc(s)!.through).toEqual([15, 3]);
		s = run(s, key('Backspace'));
		expect(draftArc(s)!.through).toBeNull();
		expect(draftArc(s)!.points).toHaveLength(2);
		s = run(s, key('Backspace'));
		expect(draftArc(s)!.points).toEqual([[0, 0]]);
		expect(draftArc(run(s, key('Backspace')))).toBeNull();
		expect(draftArc(run(arcs([0, 0], [5, -3]), key('Escape')))).toBeNull();
	});

	it('makes a straight side when the point to pass through is on the way, and ignores an end that is not possible (out past the start)', () => {
		const straight = arcs([0, 0], [5, 0], [10, 0]);
		expect(draftArc(straight)!.bulges).toEqual([0]);
		const out = run(arcs([0, 0], [5, 3]), ...click([-20, 0])); // an arc through (5, 3) cannot end on the far side of the start along the line
		expect(draftArc(out)!.points).toEqual([[0, 0]]);
	});

	it('snaps the points it takes, and does nothing with Enter before there is an arc', () => {
		const s = arcs([0.4, 0.3], [5.2, -3.1], [10.4, 0.2]);
		expect(draftArc(s)!.points).toEqual([
			[0, 0],
			[10, 0],
		]);
		expect(run(arcs([0, 0], [5, -3]), key('Enter')).outlines).toHaveLength(0);
	});

	it('is cancelled by changing tool, and the finished outline is one undo step', () => {
		expect(draftArc(run(arcs([0, 0], [5, -3]), { type: 'tool', tool: 'line' }))).toBeNull();
		const s = run(arcs([-10, 0], [0, -10], [10, 0]), key('Enter'));
		expect(run(s, { type: 'undo' }).outlines).toHaveLength(0);
	});
});

describe('the Spline tool', () => {
	const spline = (...points: SketchPoint[]) => run(start({ tool: 'spline' }), ...points.flatMap(click));
	const square: SketchPoint[] = [
		[0, 0],
		[20, 0],
		[20, 20],
		[0, 20],
	];

	it('is closed by clicking back on the first point once there are three, and every side is a smooth curve', () => {
		const s = run(spline(...square), ...click([0.2, 0.1]));
		expect(s.outlines).toHaveLength(1);
		expect(s.outlines[0]!.points).toEqual(square);
		expect(s.outlines[0]!.segments).toEqual(['curve', 'curve', 'curve', 'curve']);
	});

	it('is closed by Enter too, with three points or more', () => {
		expect(run(spline(...square), key('Enter')).outlines[0]!.segments).toHaveLength(4);
		expect(run(spline([0, 0], [10, 0]), key('Enter')).outlines).toHaveLength(0);
	});

	it('shows a smooth curve through the points so far and the pointer while it is drawn', () => {
		const s = run(spline([0, 0], [20, 0], [20, 20]), move([0, 20]));
		const preview = draftSpline(s)!;
		expect(preview.points).toEqual([
			[0, 0],
			[20, 0],
			[20, 20],
		]);
		expect(preview.curve.length).toBeGreaterThan(10);
		const near = (p: SketchPoint) => Math.min(...preview.curve.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
		for (const p of [
			[0, 0],
			[20, 0],
			[20, 20],
			[0, 20],
		] as SketchPoint[])
			expect(near(p)).toBeLessThan(1e-9);
	});

	it('takes the last point back with Backspace and all of it with Escape, like the line', () => {
		expect(draftSpline(run(spline(...square), key('Backspace')))!.points).toHaveLength(3);
		expect(draftSpline(run(spline(...square), key('Escape')))).toBeNull();
	});
});

describe('the circle tool makes a true circle', () => {
	it('two points and two half circles, of the radius dragged', () => {
		const o = draw('circle', [10, 10], [15, 10]).outlines[0]!;
		expect(o.points).toEqual([
			[5, 10],
			[15, 10],
		]);
		expect(o.segments).toEqual([1, 1]);
	});
});

describe('bending sides and smoothing', () => {
	/** A 20 x 20 square, selected. */
	const square = () => run({ ...start(), outlines: [square20()] }, ...click([10, 10]));
	function square20(): SketchOutline {
		return rectangleOutline([0, 0], [20, 20]);
	}

	it('gives the selected outline a handle in the middle of each side, and the corners', () => {
		const handles = outlineHandles(square20());
		expect(handles.points).toEqual(square20().points);
		expect(handles.mids).toEqual([
			[10, 0],
			[20, 10],
			[10, 20],
			[0, 10],
		]);
		const circle = outlineHandles(circleOutline([0, 0], 10));
		expect(circle.mids[0]![0]).toBeCloseTo(0, 6);
		expect(circle.mids[0]![1]).toBeCloseTo(-10, 6);
		expect(circle.mids[1]![1]).toBeCloseTo(10, 6);
	});

	it('bends a side into an arc when its middle is dragged: the arc goes through where it is dropped, and it is one undo step', () => {
		let s = run(square(), ...drag([10, 0], [10, -5]));
		expect(s.selected).toEqual({ outline: 0, segment: 0 });
		const o = s.outlines[0]!;
		expect(o.points).toEqual(square20().points);
		expect(o.segments![0]).toBeGreaterThan(0); // the first side runs left to right, bulging down (to its right) is anticlockwise: positive
		expect(o.segments!.slice(1)).toEqual(['line', 'line', 'line']);
		close2(segmentMidpoint(o, 0), [10, -5]);
		s = run(s, { type: 'undo' });
		expect(s.outlines[0]!.segments).toBeUndefined();
	});

	it('bends it the other way when dragged to the other side, and snaps the point it goes through', () => {
		const o = run(square(), ...drag([10, 0], [10.3, 4.8])).outlines[0]!;
		expect(o.segments![0]).toBeLessThan(0);
		close2(segmentMidpoint(o, 0), [10, 5]);
	});

	it('straightens the side again when it is dragged back onto the line, and drops the sides when all are lines', () => {
		let s = run(square(), ...drag([10, 0], [10, -5]));
		s = run(s, ...drag([10, -5], [10, 0]));
		expect(s.outlines[0]!.segments).toBeUndefined();
	});

	it('does nothing for a click on a side’s handle with no drag (no undo step), and the handles are only there for the selected outline', () => {
		const before = square();
		const clicked = run(before, ...click([10, 0]));
		expect(clicked.outlines).toEqual(before.outlines);
		expect(clicked.selected).toEqual({ outline: 0, segment: 0 });
		expect(run(clicked, { type: 'undo' }).outlines).toEqual(before.outlines);
		// an outline that is not selected has no handles on its sides: a press there is a press on its body (or nothing)
		const two = run({ ...start(), outlines: [square20(), rectangleOutline([40, 0], [60, 20])] }, ...click([10, 10]), ...click([50, 0]));
		expect(two.selected).not.toEqual({ outline: 1, segment: 0 });
	});

	it('keeps the sides when a corner or the whole outline is moved', () => {
		let s = run(square(), ...drag([10, 0], [10, -5]));
		const before = s.outlines[0]!.segments!;
		s = run(s, ...drag([20, 20], [24, 24]));
		expect(s.outlines[0]!.segments).toEqual(before);
		s = run(s, ...drag([5, 15], [7, 17]));
		expect(s.outlines[0]!.segments).toEqual(before);
	});

	it('straightens just the selected side with Delete', () => {
		let s = run(square(), ...drag([10, 0], [10, -5]), ...drag([20, 10], [25, 10]));
		expect(s.outlines[0]!.segments![1]).not.toBe('line');
		s = run(s, key('Delete'));
		expect(s.outlines[0]!.segments![1]).toBe('line');
		expect(s.outlines[0]!.segments![0]).not.toBe('line');
		expect(s.outlines).toHaveLength(1);
	});

	it('straightens every side of the selected outline with the Straighten action, as one step, and does nothing if they are straight', () => {
		let s = run(square(), ...drag([10, 0], [10, -5]), ...drag([20, 10], [25, 10]));
		s = run(s, { type: 'straighten' });
		expect(s.outlines[0]!.segments).toBeUndefined();
		expect(run(s, { type: 'undo' }).outlines[0]!.segments).toBeDefined();
		expect(run(s, { type: 'straighten' })).toBe(s);
		expect(run({ ...start(), outlines: [square20()] }, { type: 'straighten' }).outlines[0]!.segments).toBeUndefined(); // nothing selected
	});

	it('smooths every corner of the selected outline with the Smooth action, as one step', () => {
		let s = run(square(), { type: 'smooth' });
		expect(s.outlines[0]!.segments).toEqual(['curve', 'curve', 'curve', 'curve']);
		expect(run(s, { type: 'smooth' })).toBe(s);
		s = run(s, { type: 'undo' });
		expect(s.outlines[0]!.segments).toBeUndefined();
		const d = run(
			{
				...start(),
				outlines: [
					{
						points: [
							[0, 0],
							[10, 0],
						],
						segments: [1, 'line'],
					},
				],
			},
			...click([5, -4]),
		);
		expect(run(d, { type: 'smooth' }).outlines[0]!.segments).toEqual([1, 'line']); // two points cannot be a smooth curve
	});

	it('joins the two sides either side of a deleted corner: a line, unless both were smooth curves', () => {
		const make = (segments: SketchOutline['segments']) =>
			run(
				{ ...start(), outlines: [{ ...square20(), ...(segments && { segments }) }] },
				...click([10, 10]),
				...click([20, 0]),
				key('Delete'),
			);
		expect(make([0.5, 'curve', 'curve', 'line']).outlines[0]!.segments).toEqual(['line', 'curve', 'line']);
		expect(make(['curve', 'curve', 'line', 'line']).outlines[0]!.segments).toEqual(['curve', 'line', 'line']);
		expect(make(['line', 'line', 'line', 'line']).outlines[0]!.segments).toBeUndefined();
	});
});
