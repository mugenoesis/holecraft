import { type Design, isShapeType, type ShapeType, type Vec3, type WorkPlane } from '@holecraft/core';
import type { DragEvent, RefObject } from 'react';
import { LIBRARY_DRAG_TYPE, SHAPE_DRAG_TYPE } from '../shapeDrag.ts';
import { placementTarget } from './placement.ts';
import type { Viewport } from './Viewport.ts';

/** What a drop finds when there is no viewport yet: nowhere to put anything. */
const NO_VIEWPORT = { pickWorkplane: () => null, pickPlane: () => null, pickSurface: () => null };

/**
 * Handlers that let a shape dragged from the Shapes panel be dropped onto the plate: it lands where the pointer is (see placementTarget):
 * on the face of a shape under it, on the Workplane tool's plane, or on the floor, snapped to the grid.
 */
export function shapeDropHandlers(
	viewport: RefObject<Viewport | null>,
	grid: Design['grid'],
	onDropShape: (type: ShapeType, at: [number, number]) => void,
	/** A shape dropped on a plane (a face, or the Workplane tool's plane, which is `plane` when one is chosen and wins over faces). */
	onPlane: { plane: WorkPlane | null; onDrop: (type: ShapeType, plane: WorkPlane, point: Vec3) => void },
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
			const target = placementTarget(viewport.current ?? NO_VIEWPORT, e.clientX, e.clientY, grid, onPlane.plane);
			if (!target) return; // pointer is over the sky, or misses the plane
			if ('plane' in target) {
				if (isShapeType(type)) onPlane.onDrop(type, target.plane, target.point);
				else onDropSaved?.(savedId, target);
			} else if (isShapeType(type)) onDropShape(type, target.at);
			else onDropSaved?.(savedId, target);
		},
	};
}
