import { type Design, isShapeType, type ShapeType, type Vec3, type WorkPlane } from '@holecraft/core';
import type { DragEvent, RefObject } from 'react';
import { LIBRARY_DRAG_TYPE, SHAPE_DRAG_TYPE } from '../shapeDrag.ts';
import { placementTarget } from './placement.ts';
import type { Viewport } from './Viewport.ts';

/** What a drop finds when there is no viewport yet: nowhere to put anything. */
const NO_VIEWPORT = { pickWorkplane: () => null, pickPlane: () => null };

/**
 * Handlers that let a shape dragged from the Shapes panel be dropped onto the workplane: it lands where the
 * pointer meets the workplane, kept inside it and snapped to the grid.
 */
export function shapeDropHandlers(
	viewport: RefObject<Viewport | null>,
	grid: Design['grid'],
	onDropShape: (type: ShapeType, at: [number, number]) => void,
	/** With a Workplane-tool plane chosen, shapes are dropped onto it instead of the floor. */
	onPlane?: { plane: WorkPlane; onDrop: (type: ShapeType, plane: WorkPlane, point: Vec3) => void } | null,
	/** A saved shape dropped (its library id): on the floor at a point, or on the plane. */
	onDropSaved?: (id: string, where: { at: [number, number] } | { plane: WorkPlane; point: Vec3 }) => void,
): { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void } {
	return {
		onDragOver: (e) => {
			if (!e.dataTransfer.types.includes(SHAPE_DRAG_TYPE) && !e.dataTransfer.types.includes(LIBRARY_DRAG_TYPE)) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		},
		onDrop: (e) => {
			const type = e.dataTransfer.getData(SHAPE_DRAG_TYPE);
			const savedId = e.dataTransfer.getData(LIBRARY_DRAG_TYPE);
			if (!isShapeType(type) && !savedId) return;
			e.preventDefault();
			const target = placementTarget(viewport.current ?? NO_VIEWPORT, e.clientX, e.clientY, grid, onPlane?.plane ?? null);
			if (!target) return; // pointer is over the sky, or misses the plane
			if ('plane' in target) {
				if (isShapeType(type)) onPlane?.onDrop(type, target.plane, target.point);
				else onDropSaved?.(savedId, target);
			} else if (isShapeType(type)) onDropShape(type, target.at);
			else onDropSaved?.(savedId, target);
		},
	};
}
