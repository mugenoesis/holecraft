import type { NodeId } from '@holecraft/core';

/** A left press (a mouse button or one finger): what it landed on and how it was made. */
export interface PressKind {
	id: NodeId | null;
	/** Shift (or the Select toggle): the press adds to or takes from the selection instead of replacing it. */
	additive: boolean;
	/** A finger rather than a mouse. */
	touch: boolean;
}

/**
 * What a press that has started to move becomes. Dragging a shape moves it, except an additive press only toggles it. On
 * empty space a mouse draws the selection box and a finger orbits, unless the Select toggle is on (then a finger draws the
 * box too) or a surface tool (ruler, workplane, edges) owns the left button, which always orbits.
 */
export function dragModeFor(press: PressKind, surfaceToolOn: boolean, multiSelectOn: boolean): 'move' | 'marquee' | 'orbit' | 'none' {
	if (press.id === null) {
		if (surfaceToolOn) return 'orbit';
		return press.touch && !multiSelectOn ? 'orbit' : 'marquee';
	}
	return press.additive ? 'none' : 'move';
}
