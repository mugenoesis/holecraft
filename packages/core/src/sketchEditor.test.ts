import { describe, expect, it } from 'vitest';
import { outlineArea, rectangleOutline, type SketchOutline, type SketchPoint } from './sketch.ts';
import {
	createSketchEditor,
	draftLine,
	draftOutline,
	MAX_SIDES,
	MIN_SIDES,
	type SketchAction,
	type SketchEditorState,
	selectedOutline,
	sketchReducer,
} from './sketchEditor.ts';

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
