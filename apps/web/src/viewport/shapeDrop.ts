import { clampToWorkplane, type Design, isShapeType, type ShapeType, snapToGrid } from '@holecraft/core';
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
			const hit = viewport.current?.pickWorkplane(e.clientX, e.clientY);
			if (!hit) return; // pointer is over the sky or an edge-on workplane
			const [x, y] = clampToWorkplane(hit, grid.size);
			onDropShape(type, [snapToGrid(x, grid.snap), snapToGrid(y, grid.snap)]);
		},
	};
}
