import type { SketchEditorState } from '@holecraft/core';

/** The line of help under the Sketch bar's controls: what to do with the tool in use, as far as the drawing has got. */
export function sketchHint(state: SketchEditorState): string {
	const { tool, draft } = state;
	if (tool === 'line') {
		const points = draft?.kind === 'line' ? draft.points.length : 0;
		if (points === 0) return 'Click to add points, one corner after another';
		if (points < 3) return 'Click the next point · Backspace removes the last · Esc cancels the line';
		return 'Click the next point · click the first point or press Enter to close · Backspace removes the last · Esc cancels';
	}
	if (tool === 'select') {
		return state.selected
			? 'Drag to move it, or drag a corner to reshape it · Delete removes it · click empty space to let go'
			: 'Click an outline to select it (an outline inside another is a hole)';
	}
	if (tool === 'rectangle') return 'Drag from one corner to the opposite one';
	if (tool === 'circle') return 'Drag from the centre out to the edge';
	return `Drag from the centre to a corner (${state.sides} sides)`;
}
