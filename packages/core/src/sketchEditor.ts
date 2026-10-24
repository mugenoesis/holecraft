import {
	circleOutline,
	MAX_SKETCH_OUTLINES,
	MAX_SKETCH_POINTS,
	outlineArea,
	rectangleOutline,
	regularPolygon,
	SKETCH_TOLERANCE,
	type SketchOutline,
	type SketchPoint,
	type SketchSegment,
	sketchHits,
} from './sketch.ts';
import { bulgeThrough, flattenPath, segmentMidpoint } from './sketchCurves.ts';
import { filletCorners } from './sketchFillet.ts';
import { hasCurves, sideOf, smoothed, straightened, withoutPoint, withSide, withSides } from './sketchSides.ts';

/**
 * The logic of the Sketch tool's drawing mode, with no screen in it: a state and a reducer fed plane coordinates (mm) and keys, so it is
 * tested without a browser. The view turns the pointer into plane coordinates, draws `outlines` and the draft, and gives back what was done.
 */

export type SketchTool = 'select' | 'rectangle' | 'circle' | 'polygon' | 'line' | 'arc' | 'spline';
export const MIN_SIDES = 3;
export const MAX_SIDES = 32;
const DEFAULT_SIDES = 6;
const DEFAULT_SNAP = 1;
/** A drawn shape smaller than this (mm) across is a slip of the hand, not a shape. */
const MIN_DRAWN = 0.1;
const MAX_HISTORY = 100;

export interface Selected {
	outline: number;
	/** Set when one point of the outline is selected (to move it, or delete it). */
	point?: number;
	/** Set when one side of the outline is selected, by its middle handle (to bend it, or straighten it). */
	segment?: number;
}

type Draft =
	/** A rectangle, circle or polygon being dragged out. */
	| { kind: 'shape'; from: SketchPoint; to: SketchPoint }
	/** A line (or, with the Spline tool, a smooth curve) of points being clicked out, and where the pointer is now. */
	| { kind: 'line'; points: SketchPoint[]; hover: SketchPoint | null }
	/** A path of arcs being clicked out: the corners so far, the bulge of the arc to each, the point the next arc goes through, and the pointer. */
	| { kind: 'arc'; points: SketchPoint[]; bulges: number[]; through: SketchPoint | null; hover: SketchPoint | null }
	/** A point or a whole outline being dragged, from the outlines as they were when the press began. */
	| { kind: 'edit'; target: Selected; start: SketchPoint; base: SketchOutline[]; moved: boolean };

export interface SketchEditorState {
	outlines: SketchOutline[];
	tool: SketchTool;
	/** Corners of a Polygon. */
	sides: number;
	/** Grid size in mm that points snap to; 0 is off. */
	snap: number;
	selected: Selected | null;
	draft: Draft | null;
	past: SketchOutline[][];
	future: SketchOutline[][];
}

export type SketchAction =
	| { type: 'tool'; tool: SketchTool }
	| { type: 'sides'; sides: number }
	| { type: 'snap'; snap: number }
	| { type: 'down'; at: SketchPoint; reach: number }
	| { type: 'move'; at: SketchPoint; reach: number }
	| { type: 'up'; at: SketchPoint }
	| { type: 'key'; key: string; ctrl?: boolean; shift?: boolean }
	| { type: 'undo' }
	| { type: 'redo' }
	// the selected outline: every side a line, or every side a smooth curve
	| { type: 'straighten' }
	| { type: 'smooth' }
	// round the selected corner, or every corner of the selected outline, to this radius (mm)
	| { type: 'fillet'; radius: number };

export function createSketchEditor(outlines: readonly SketchOutline[] = []): SketchEditorState {
	return {
		outlines: outlines.map((o) => ({
			points: o.points.map((p): SketchPoint => [p[0], p[1]]),
			...(o.segments && { segments: [...o.segments] }),
		})),
		tool: 'select',
		sides: DEFAULT_SIDES,
		snap: DEFAULT_SNAP,
		selected: null,
		draft: null,
		past: [],
		future: [],
	};
}

const snapped = (p: SketchPoint, snap: number): SketchPoint =>
	snap > 0 ? [Math.round(p[0] / snap) * snap + 0, Math.round(p[1] / snap) * snap + 0] : [p[0], p[1]];
const distance = (a: SketchPoint, b: SketchPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The outline a rectangle, circle or polygon drag makes, or null if it has no size (yet). */
function shapeOutline(state: SketchEditorState, from: SketchPoint, to: SketchPoint): SketchOutline | null {
	const radius = distance(from, to);
	if (state.tool === 'rectangle') {
		const outline = rectangleOutline(from, to);
		return Math.abs(from[0] - to[0]) >= MIN_DRAWN && Math.abs(from[1] - to[1]) >= MIN_DRAWN ? outline : null;
	}
	if (radius < MIN_DRAWN) return null;
	if (state.tool === 'circle') return circleOutline(from, radius);
	if (state.tool === 'polygon') return regularPolygon(from, radius, state.sides, Math.atan2(to[1] - from[1], to[0] - from[0]));
	return null;
}

/** The shape being dragged out, for drawing it while the button is down. */
export function draftOutline(state: SketchEditorState): SketchOutline | null {
	return state.draft?.kind === 'shape' ? shapeOutline(state, state.draft.from, state.draft.to) : null;
}

/** The line being clicked out: its points, and the rubber band's end (the snapped pointer). */
export function draftLine(state: SketchEditorState): { points: SketchPoint[]; hover: SketchPoint | null } | null {
	return state.draft?.kind === 'line' ? { points: state.draft.points, hover: state.draft.hover } : null;
}

/** The path of arcs being clicked out: its corners, the bulge of each arc, the point the next goes through, and the points to draw it by. */
export function draftArc(state: SketchEditorState): {
	points: SketchPoint[];
	bulges: number[];
	through: SketchPoint | null;
	/** The arcs placed so far, as points of a path. */
	placed: SketchPoint[];
	/** The next arc as the pointer would make it (a straight line until a point to pass through is chosen). */
	preview: SketchPoint[] | null;
} | null {
	const d = state.draft;
	if (d?.kind !== 'arc') return null;
	const last = d.points[d.points.length - 1]!;
	const placed = flattenPath(d.points, d.bulges.map(sideOf), SKETCH_TOLERANCE);
	const bulge = d.through && d.hover ? bulgeThrough(last, d.through, d.hover) : null;
	const preview = d.hover ? flattenPath([last, d.hover], [bulge === null ? 'line' : sideOf(bulge)], SKETCH_TOLERANCE) : null;
	return { points: d.points, bulges: d.bulges, through: d.through, placed, preview };
}

/** The smooth curve being clicked out with the Spline tool: its points, and the curve through them and the pointer (an open curve). */
export function draftSpline(state: SketchEditorState): { points: SketchPoint[]; curve: SketchPoint[] } | null {
	const d = state.draft;
	if (d?.kind !== 'line' || state.tool !== 'spline') return null;
	const through = d.hover ? [...d.points, d.hover] : d.points;
	return {
		points: d.points,
		curve: flattenPath(
			through,
			through.map(() => 'curve'),
			SKETCH_TOLERANCE,
		),
	};
}

/** The handles of an outline: its corners and the middle of each side (where a side is grabbed to bend it). */
export function outlineHandles(outline: SketchOutline): { points: SketchPoint[]; mids: SketchPoint[] } {
	return { points: outline.points, mids: outline.points.map((_, i) => segmentMidpoint(outline, i)) };
}

/** The selected outline, if one is. */
export function selectedOutline(state: SketchEditorState): SketchOutline | null {
	return state.selected ? (state.outlines[state.selected.outline] ?? null) : null;
}

/** `outlines` kept as the new drawing, with the old one to go back to. */
function commit(state: SketchEditorState, outlines: SketchOutline[], before: SketchOutline[] = state.outlines): SketchEditorState {
	return { ...state, outlines, past: [...state.past, before].slice(-MAX_HISTORY), future: [] };
}

/** An outline added to the drawing, unless it has no area or the drawing is full. */
function withOutline(state: SketchEditorState, outline: SketchOutline | null): SketchEditorState {
	const idle = { ...state, draft: null };
	if (!outline || Math.abs(outlineArea(outline)) < 1e-9 || state.outlines.length >= MAX_SKETCH_OUTLINES) return idle;
	return commit(idle, [...state.outlines, outline]);
}

/** The point of the drawing nearest `at` within `reach`: among the selected outline's points first, else any. */
function hitPoint(state: SketchEditorState, at: SketchPoint, reach: number): Selected | null {
	const order = state.outlines
		.map((_, i) => i)
		.sort((a, b) => Number(b === state.selected?.outline) - Number(a === state.selected?.outline));
	let best: Selected | null = null;
	let bestDistance = reach;
	for (const outline of order) {
		for (const [point, p] of state.outlines[outline]!.points.entries()) {
			if (distance(at, p) < bestDistance) [best, bestDistance] = [{ outline, point }, distance(at, p)];
		}
	}
	return best;
}

/** The middle handle of a side of the selected outline within `reach` of `at`: the side it belongs to, or null. */
function hitSide(state: SketchEditorState, at: SketchPoint, reach: number): Selected | null {
	const outline = state.selected ? state.outlines[state.selected.outline] : undefined;
	if (!state.selected || !outline) return null;
	let best: Selected | null = null;
	let bestDistance = reach;
	for (let segment = 0; segment < outline.points.length; segment++) {
		const d = distance(at, segmentMidpoint(outline, segment));
		if (d < bestDistance) [best, bestDistance] = [{ outline: state.selected.outline, segment }, d];
	}
	return best;
}

function pressSelect(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	const hit = hitPoint(state, at, reach) ?? hitSide(state, at, reach);
	const body = sketchHits({ outlines: state.outlines }, at)[0];
	const selected = hit ?? (body === undefined ? null : { outline: body });
	if (!selected) return { ...state, selected: null, draft: null };
	return { ...state, selected, draft: { kind: 'edit', target: selected, start: at, base: state.outlines, moved: false } };
}

/** The outline a finished line makes: straight sides, or all smooth curves for the Spline tool. */
const lineOutline = (state: SketchEditorState, points: SketchPoint[]): SketchOutline =>
	state.tool === 'spline' ? { points, segments: points.map((): SketchSegment => 'curve') } : { points };

function pressLine(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	const points = state.draft?.kind === 'line' ? state.draft.points : [];
	const here = snapped(at, state.snap);
	const first = points[0];
	if (first && points.length >= 3 && distance(at, first) <= reach) return withOutline(state, lineOutline(state, points));
	const last = points[points.length - 1];
	if ((first && distance(at, first) <= reach) || (last && distance(here, last) < 1e-9) || points.length >= MAX_SKETCH_POINTS) return state;
	return { ...state, draft: { kind: 'line', points: [...points, here], hover: here } };
}

/** An arc's side kind, a line when it is flat enough. */
const arcSides = (bulges: readonly number[]): SketchSegment[] => bulges.map(sideOf);

/** The outline of an arc path, closed back to its first point by a side of the given kind. */
const arcOutline = (d: Extract<Draft, { kind: 'arc' }>, closing: SketchSegment): SketchOutline =>
	withSides({ points: d.points }, [...arcSides(d.bulges), closing]);

/** A click with the Arc tool: the start, then each arc's point to pass through and its end (clicking back on the start closes the outline with that arc). */
function pressArc(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	const here = snapped(at, state.snap);
	const d = state.draft?.kind === 'arc' ? state.draft : null;
	if (!d) return { ...state, selected: null, draft: { kind: 'arc', points: [here], bulges: [], through: null, hover: here } };
	const last = d.points[d.points.length - 1]!;
	if (!d.through) return distance(here, last) < 1e-9 ? state : { ...state, draft: { ...d, through: here } };
	const closing = d.points.length >= 2 && distance(at, d.points[0]!) <= reach;
	const end = closing ? d.points[0]! : here;
	const bulge = bulgeThrough(last, d.through, end);
	if (bulge === null) return state;
	if (closing) return withOutline(state, arcOutline(d, sideOf(bulge)));
	if (d.points.length >= MAX_SKETCH_POINTS) return state;
	return { ...state, draft: { ...d, points: [...d.points, end], bulges: [...d.bulges, bulge], through: null, hover: end } };
}

function press(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	if (state.tool === 'select') return pressSelect(state, at, reach);
	if (state.tool === 'line' || state.tool === 'spline') return pressLine(state, at, reach);
	if (state.tool === 'arc') return pressArc(state, at, reach);
	if (state.outlines.length >= MAX_SKETCH_OUTLINES) return state;
	const from = snapped(at, state.snap);
	return { ...state, selected: null, draft: { kind: 'shape', from, to: from } };
}

/** Side `segment` of `outline` bent so its arc goes through `through` (a line when that is on the chord); the outline as it was if there is no such arc. */
function bent(outline: SketchOutline, segment: number, through: SketchPoint): SketchOutline {
	const [a, b] = [outline.points[segment]!, outline.points[(segment + 1) % outline.points.length]!];
	const bulge = bulgeThrough(a, through, b);
	return bulge === null ? outline : withSide(outline, segment, sideOf(bulge));
}

/** `base` with the dragged point, side or whole outline moved to follow the pointer from where it was pressed. */
function dragged(state: SketchEditorState, draft: Extract<Draft, { kind: 'edit' }>, at: SketchPoint): SketchOutline[] {
	const { outline, point, segment } = draft.target;
	const to = snapped(at, state.snap);
	const shift: SketchPoint = [at[0] - draft.start[0], at[1] - draft.start[1]];
	const step = state.snap > 0 ? snapped(shift, state.snap) : shift;
	return draft.base.map((o, i) => {
		if (i !== outline) return o;
		if (segment !== undefined) return bent(o, segment, to);
		const moved = o.points.map((p, k): SketchPoint => (point === undefined ? [p[0] + step[0], p[1] + step[1]] : k === point ? to : p));
		return { ...o, points: moved };
	});
}

function track(state: SketchEditorState, at: SketchPoint): SketchEditorState {
	const draft = state.draft;
	const hover = snapped(at, state.snap);
	if (draft?.kind === 'shape') return { ...state, draft: { ...draft, to: hover } };
	if (draft?.kind === 'line' || draft?.kind === 'arc') return { ...state, draft: { ...draft, hover } };
	if (draft?.kind === 'edit') {
		const outlines = dragged(state, draft, at);
		return { ...state, outlines, draft: { ...draft, moved: JSON.stringify(outlines) !== JSON.stringify(draft.base) } };
	}
	return state;
}

function release(state: SketchEditorState): SketchEditorState {
	const draft = state.draft;
	if (draft?.kind === 'shape') return withOutline(state, shapeOutline(state, draft.from, draft.to));
	if (draft?.kind === 'edit') {
		const done = { ...state, draft: null };
		return draft.moved ? commit(done, state.outlines, draft.base) : done;
	}
	return state;
}

/** Whatever is half done is given up (a dragged point goes back where it was). */
function cancel(state: SketchEditorState): SketchEditorState {
	const draft = state.draft;
	return { ...state, draft: null, outlines: draft?.kind === 'edit' ? draft.base : state.outlines };
}

/** Delete: a selected side goes straight again; a selected corner goes (the outline keeps three, or two with a curved side); otherwise the outline goes. */
function deleteSelected(state: SketchEditorState): SketchEditorState {
	const sel = state.selected;
	const outline = sel ? state.outlines[sel.outline] : undefined;
	if (!sel || !outline) return state;
	if (sel.segment !== undefined) return replaceSelected(state, withSide(outline, sel.segment, 'line'), sel);
	const keepsShape = sel.point !== undefined && outline.points.length > (hasCurves(outline) ? 2 : 3);
	if (keepsShape) return replaceSelected(state, withoutPoint(outline, sel.point!), { outline: sel.outline });
	return {
		...commit(
			state,
			state.outlines.filter((_, i) => i !== sel.outline),
		),
		selected: null,
	};
}

/** The selected outline replaced (one undo step), and what is selected afterwards; the same state if nothing changed. */
function replaceSelected(state: SketchEditorState, outline: SketchOutline, selected: Selected): SketchEditorState {
	const was = state.outlines[selected.outline]!;
	if (JSON.stringify(was) === JSON.stringify(outline)) return state;
	return {
		...commit(
			state,
			state.outlines.map((o, i) => (i === selected.outline ? outline : o)),
		),
		selected,
	};
}

/** Straighten or Smooth: every side of the selected outline made a line, or a smooth curve. */
function reshape(state: SketchEditorState, change: (o: SketchOutline) => SketchOutline): SketchEditorState {
	const outline = state.selected ? state.outlines[state.selected.outline] : undefined;
	return state.selected && outline && !state.draft ? replaceSelected(state, change(outline), { outline: state.selected.outline }) : state;
}

/** Fillet: the selected corner rounded to `radius`, or all the corners of the selected outline when no single corner is selected. */
function fillet(state: SketchEditorState, radius: number): SketchEditorState {
	const sel = state.selected;
	const outline = sel ? state.outlines[sel.outline] : undefined;
	if (!sel || !outline || state.draft) return state;
	const corners = sel.point === undefined ? outline.points.map((_, k) => k) : [sel.point];
	return replaceSelected(state, filletCorners(outline, radius, corners), { outline: sel.outline });
}

function undo(state: SketchEditorState): SketchEditorState {
	const before = state.past[state.past.length - 1];
	if (!before) return state;
	return {
		...state,
		outlines: before,
		past: state.past.slice(0, -1),
		future: [state.outlines, ...state.future],
		selected: null,
		draft: null,
	};
}

function redo(state: SketchEditorState): SketchEditorState {
	const [after, ...rest] = state.future;
	if (!after) return state;
	return { ...state, outlines: after, past: [...state.past, state.outlines], future: rest, selected: null, draft: null };
}

/** Enter closes a line (three points or more), a curve being drawn with the Spline tool (the same), or a path of arcs (two points or more, with a straight side back). */
function closeLine(state: SketchEditorState): SketchEditorState {
	const d = state.draft;
	if (d?.kind === 'arc') return d.points.length >= 2 ? withOutline(state, arcOutline(d, 'line')) : state;
	return d?.kind === 'line' && d.points.length >= 3 ? withOutline(state, lineOutline(state, d.points)) : state;
}

/** Backspace takes the last point back from a line or path being drawn (all of it goes with its first point), else deletes the selection. */
function backspace(state: SketchEditorState): SketchEditorState {
	const d = state.draft;
	if (d?.kind === 'line') {
		const points = d.points.slice(0, -1);
		return { ...state, draft: points.length ? { ...d, points } : null };
	}
	if (d?.kind === 'arc') return { ...state, draft: backedArc(d) };
	return d ? state : deleteSelected(state);
}

/** An arc path with its point to pass through taken back, or else its last arc, or (with one point left) nothing. */
function backedArc(d: Extract<Draft, { kind: 'arc' }>): Draft | null {
	if (d.through) return { ...d, through: null };
	return d.points.length > 1 ? { ...d, points: d.points.slice(0, -1), bulges: d.bulges.slice(0, -1) } : null;
}

/** Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo. */
function pressControlKey(state: SketchEditorState, key: string, shift: boolean): SketchEditorState {
	if (key === 'y' || (key === 'z' && shift)) return redo(state);
	return key === 'z' ? undo(state) : state;
}

function pressKey(state: SketchEditorState, action: Extract<SketchAction, { type: 'key' }>): SketchEditorState {
	const key = action.key.length === 1 ? action.key.toLowerCase() : action.key;
	if (action.ctrl) return pressControlKey(state, key, action.shift === true);
	if (key === 'Enter') return closeLine(state);
	if (key === 'Escape') return state.draft ? cancel(state) : { ...state, selected: null };
	if (key === 'Backspace') return backspace(state);
	return key === 'Delete' && !state.draft ? deleteSelected(state) : state;
}

function setTool(state: SketchEditorState, tool: SketchTool): SketchEditorState {
	const idle = cancel(state);
	return { ...idle, tool, selected: tool === 'select' ? idle.selected : null };
}

export function sketchReducer(state: SketchEditorState, action: SketchAction): SketchEditorState {
	switch (action.type) {
		case 'tool':
			return setTool(state, action.tool);
		case 'sides':
			return Number.isFinite(action.sides)
				? { ...state, sides: Math.max(MIN_SIDES, Math.min(MAX_SIDES, Math.round(action.sides))) }
				: state;
		case 'snap':
			return Number.isFinite(action.snap) && action.snap >= 0 ? { ...state, snap: action.snap } : state;
		case 'down':
			return press(state, action.at, action.reach);
		case 'move':
			return track(state, action.at);
		case 'up':
			return release(state);
		case 'key':
			return pressKey(state, action);
		case 'undo':
			return undo(state);
		case 'redo':
			return redo(state);
		case 'straighten':
			return reshape(state, straightened);
		case 'smooth':
			return reshape(state, smoothed);
		case 'fillet':
			return fillet(state, action.radius);
	}
}
