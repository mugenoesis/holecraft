import type { SketchEditorState } from '@holecraft/core';

/** The Arc tool's help: start, then through, then end, and how to close. */
function arcHint(state: SketchEditorState): string {
	const d = state.draft?.kind === 'arc' ? state.draft : null;
	if (!d) return 'Click where the arc starts';
	if (d.through) return 'Click where this arc ends (click the first point to close)';
	return d.points.length > 1
		? 'Click a point the next arc passes through · Enter closes with a straight side · Backspace takes the last arc back'
		: 'Click a point the arc passes through';
}

/** The Spline tool's help. */
function splineHint(state: SketchEditorState): string {
	const points = state.draft?.kind === 'line' ? state.draft.points.length : 0;
	if (points === 0) return 'Click points: a smooth curve goes through all of them';
	if (points < 3) return 'Click the next point · Backspace removes the last · Esc cancels the curve';
	return 'Click the next point · click the first point or press Enter to close the curve · Backspace removes the last';
}

/** The line of help under the Sketch bar's controls: what to do with the tool in use, as far as the drawing has got. */
export function sketchHint(state: SketchEditorState): string {
	const { tool, draft } = state;
	if (tool === 'line') {
		const points = draft?.kind === 'line' ? draft.points.length : 0;
		if (points === 0) return 'Click to add points, one corner after another';
		if (points < 3) return 'Click the next point · Backspace removes the last · Esc cancels the line';
		return 'Click the next point · click the first point or press Enter to close · Backspace removes the last · Esc cancels';
	}
	if (tool === 'arc') return arcHint(state);
	if (tool === 'spline') return splineHint(state);
	if (tool === 'select') {
		return state.selected
			? 'Drag to move it, a corner to reshape it, or a ◆ on a side to bend it · Delete removes it (a side goes straight again) · click empty space to let go'
			: 'Click an outline to select it (an outline inside another is a hole)';
	}
	if (tool === 'rectangle') return 'Drag from one corner to the opposite one';
	if (tool === 'circle') return 'Drag from the centre out to the edge';
	return `Drag from the centre to a corner (${state.sides} sides)`;
}
