import {
	circleOutline,
	MAX_SKETCH_OUTLINES,
	MAX_SKETCH_POINTS,
	outlineArea,
	rectangleOutline,
	regularPolygon,
	type SketchOutline,
	type SketchPoint,
	sketchHits,
} from './sketch.ts';

/**
 * The logic of the Sketch tool's drawing mode, with no screen in it: a state and a reducer fed plane coordinates (mm) and keys, so it is
 * tested without a browser. The view turns the pointer into plane coordinates, draws `outlines` and the draft, and gives back what was done.
 */

export type SketchTool = 'select' | 'rectangle' | 'circle' | 'polygon' | 'line';
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
}

type Draft =
	/** A rectangle, circle or polygon being dragged out. */
	| { kind: 'shape'; from: SketchPoint; to: SketchPoint }
	/** A line of points being clicked out, and where the pointer is now. */
	| { kind: 'line'; points: SketchPoint[]; hover: SketchPoint | null }
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
	| { type: 'redo' };

export function createSketchEditor(outlines: readonly SketchOutline[] = []): SketchEditorState {
	return {
		outlines: outlines.map((o) => ({ points: o.points.map((p): SketchPoint => [p[0], p[1]]) })),
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

function pressSelect(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	const target = hitPoint(state, at, reach) ?? sketchHits({ outlines: state.outlines }, at)[0] ?? null;
	const selected = typeof target === 'number' ? { outline: target } : target;
	if (!selected) return { ...state, selected: null, draft: null };
	return { ...state, selected, draft: { kind: 'edit', target: selected, start: at, base: state.outlines, moved: false } };
}

function pressLine(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	const points = state.draft?.kind === 'line' ? state.draft.points : [];
	const here = snapped(at, state.snap);
	const first = points[0];
	if (first && points.length >= 3 && distance(at, first) <= reach) return withOutline(state, { points });
	const last = points[points.length - 1];
	if ((first && distance(at, first) <= reach) || (last && distance(here, last) < 1e-9) || points.length >= MAX_SKETCH_POINTS) return state;
	return { ...state, draft: { kind: 'line', points: [...points, here], hover: here } };
}

function press(state: SketchEditorState, at: SketchPoint, reach: number): SketchEditorState {
	if (state.tool === 'select') return pressSelect(state, at, reach);
	if (state.tool === 'line') return pressLine(state, at, reach);
	if (state.outlines.length >= MAX_SKETCH_OUTLINES) return state;
	const from = snapped(at, state.snap);
	return { ...state, selected: null, draft: { kind: 'shape', from, to: from } };
}

/** `base` with the dragged point, or the whole dragged outline, moved to follow the pointer from where it was pressed. */
function dragged(state: SketchEditorState, draft: Extract<Draft, { kind: 'edit' }>, at: SketchPoint): SketchOutline[] {
	const { outline, point } = draft.target;
	const to = snapped(at, state.snap);
	const shift: SketchPoint = [at[0] - draft.start[0], at[1] - draft.start[1]];
	const step = state.snap > 0 ? snapped(shift, state.snap) : shift;
	return draft.base.map((o, i) => {
		if (i !== outline) return o;
		return { points: o.points.map((p, k): SketchPoint => (point === undefined ? [p[0] + step[0], p[1] + step[1]] : k === point ? to : p)) };
	});
}

function track(state: SketchEditorState, at: SketchPoint): SketchEditorState {
	const draft = state.draft;
	if (draft?.kind === 'shape') return { ...state, draft: { ...draft, to: snapped(at, state.snap) } };
	if (draft?.kind === 'line') return { ...state, draft: { ...draft, hover: snapped(at, state.snap) } };
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

function deleteSelected(state: SketchEditorState): SketchEditorState {
	const sel = state.selected;
	const outline = sel ? state.outlines[sel.outline] : undefined;
	if (!sel || !outline) return state;
	const keepsShape = sel.point !== undefined && outline.points.length > 3;
	const outlines = state.outlines.flatMap((o, i) => {
		if (i !== sel.outline) return [o];
		return keepsShape ? [{ points: o.points.filter((_, k) => k !== sel.point) }] : [];
	});
	return { ...commit(state, outlines), selected: keepsShape ? { outline: sel.outline } : null };
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

/** Enter closes a line that has three points or more. */
function closeLine(state: SketchEditorState): SketchEditorState {
	const line = state.draft?.kind === 'line' ? state.draft : null;
	return line && line.points.length >= 3 ? withOutline(state, { points: line.points }) : state;
}

/** Backspace takes the last point back from a line being drawn (the line goes with its last point), else deletes the selection. */
function backspace(state: SketchEditorState): SketchEditorState {
	if (state.draft?.kind === 'line') {
		const points = state.draft.points.slice(0, -1);
		return { ...state, draft: points.length ? { ...state.draft, points } : null };
	}
	return state.draft ? state : deleteSelected(state);
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
	}
}
