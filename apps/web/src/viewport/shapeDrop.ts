import {
	clampToWorkplane,
	type Design,
	isShapeType,
	type ShapeType,
	snapOnPlane,
	snapToGrid,
	type Vec3,
	type WorkPlane,
} from '@holecraft/core';
import type { DragEvent, RefObject } from 'react';
import { SHAPE_DRAG_TYPE } from '../shapeDrag.ts';
import type { Viewport } from './Viewport.ts';

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
): { onDragOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void } {
	return {
		onDragOver: (e) => {
			if (!e.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		},
		onDrop: (e) => {
			const type = e.dataTransfer.getData(SHAPE_DRAG_TYPE);
			if (!isShapeType(type)) return;
			e.preventDefault();
			if (onPlane) {
				const on = viewport.current?.pickPlane(e.clientX, e.clientY, onPlane.plane.origin, onPlane.plane.normal);
				if (on) onPlane.onDrop(type, onPlane.plane, snapOnPlane(onPlane.plane, on, grid.snap));
				return;
			}
			const hit = viewport.current?.pickWorkplane(e.clientX, e.clientY);
			if (!hit) return; // pointer is over the sky or an edge-on workplane
			const [x, y] = clampToWorkplane(hit, grid.size);
			onDropShape(type, [snapToGrid(x, grid.snap), snapToGrid(y, grid.snap)]);
		},
	};
}
