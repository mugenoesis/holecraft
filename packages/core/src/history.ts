/** Snapshot-based undo/redo. Snapshots are immutable, so structural sharing keeps them cheap. */
export interface History<T> {
	past: T[];
	present: T;
	future: T[];
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
	return { past: [], present, future: [] };
}

export const canUndo = (h: History<unknown>): boolean => h.past.length > 0;
export const canRedo = (h: History<unknown>): boolean => h.future.length > 0;

/**
 * Makes `next` the present and records `base` as the state to undo to. `base` defaults to the
 * current present; pass the pre-drag state to commit a live preview as a single step.
 * A change from a state to itself is ignored.
 */
export function pushHistory<T>(h: History<T>, next: T, base: T = h.present, limit = DEFAULT_HISTORY_LIMIT): History<T> {
	if (Object.is(next, base)) return h;
	return { past: [...h.past, base].slice(-limit), present: next, future: [] };
}

/** Changes the present without an undo step, for live previews such as dragging. */
export function replacePresent<T>(h: History<T>, next: T): History<T> {
	return { ...h, present: next };
}

export function undo<T>(h: History<T>): History<T> {
	const previous = h.past.at(-1);
	if (previous === undefined) return h;
	return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
	const [next, ...rest] = h.future;
	if (next === undefined) return h;
	return { past: [...h.past, h.present], present: next, future: rest };
}
