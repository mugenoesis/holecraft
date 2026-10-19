import { type Design, getShapeDef, nodeBoundsIn, type ShapeType, type Vec3 } from '@holecraft/core';
import type { EditorAction } from './editorState.ts';
import type { PlacementTarget } from './viewport/placement.ts';

/** What is armed to be put down with the next click on the plate: a built-in shape, or a saved one (opened from the library when armed). */
export type Placing = { kind: 'shape'; type: ShapeType } | { kind: 'saved'; id: string; name: string; shape: Design };

/** How big the ghost is: a shape at the size it is added at, a saved shape the box round it. */
export function placingSize(placing: Placing): Vec3 {
	if (placing.kind === 'shape') return [...getShapeDef(placing.type).defaultSize];
	const root = placing.shape.roots[0];
	const bounds = root ? nodeBoundsIn(placing.shape, root) : null;
	if (!bounds) return [10, 10, 10];
	return [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
}

export function samePlacing(a: Placing, b: Placing | null): boolean {
	if (!b || a.kind !== b.kind) return false;
	return a.kind === 'shape' ? a.type === (b as typeof a).type : a.id === (b as typeof a).id;
}

/** What the ghost is called in the line under the Shapes heading. */
function placingName(placing: Placing): string {
	return placing.kind === 'shape' ? `a ${getShapeDef(placing.type).name}` : placing.name;
}

/** The line under the Shapes heading: how to put a shape down, or what is being put down and how to stop. */
export function placingHint(placing: Placing | null, touch: boolean): string {
	if (placing) return `Placing ${placingName(placing)}: click the plane to put it down. Esc cancels.`;
	return touch
		? 'Tap a shape to add it, or drag it onto the plane.'
		: 'Click a shape, then click the plane to place it, or drag it onto the plane.';
}

/** What putting `placing` down at `target` does to the design: the same actions as adding a shape by a drop (a saved shape is added from the copy opened when it was armed). */
export function placementAction(placing: Placing, target: PlacementTarget): EditorAction {
	if (placing.kind === 'saved') return { type: 'addLibrary', shape: placing.shape, ...target };
	if ('plane' in target) return { type: 'addOnPlane', shape: placing.type, plane: target.plane, point: target.point };
	return { type: 'add', shape: placing.type, at: target.at };
}
