import type { ShapeType, Vec3, WorkPlane } from '@holecraft/core';
import type { DragEvent, RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SHAPE_DRAG_TYPE } from '../shapeDrag.ts';
import { shapeDropHandlers } from './shapeDrop.ts';
import type { Viewport } from './Viewport.ts';

const GRID = { size: [200, 200] as [number, number], snap: 5, visible: true } as never;

function setup(opts: { floor?: [number, number] | null; plane?: Vec3 | null; withPlane?: boolean } = {}) {
	const pickWorkplane = vi.fn(() => opts.floor ?? null);
	const pickPlane = vi.fn(() => opts.plane ?? null);
	const viewport = { current: { pickWorkplane, pickPlane } as unknown as Viewport } as RefObject<Viewport | null>;
	const onDropShape = vi.fn<(type: ShapeType, at: [number, number]) => void>();
	const onPlaneDrop = vi.fn<(type: ShapeType, plane: WorkPlane, point: Vec3) => void>();
	const plane: WorkPlane = { origin: [0, 0, 20], normal: [0, 0, 1] };
	const handlers = shapeDropHandlers(viewport, GRID, onDropShape, opts.withPlane ? { plane, onDrop: onPlaneDrop } : null);
	return { handlers, onDropShape, onPlaneDrop, pickWorkplane, pickPlane, plane };
}

const dropEvent = (data: string) =>
	({
		clientX: 10,
		clientY: 20,
		preventDefault: vi.fn(),
		dataTransfer: { getData: () => data, types: [SHAPE_DRAG_TYPE] },
	}) as unknown as DragEvent;

describe('shapeDropHandlers', () => {
	it('drag over only accepts shapes from the Shapes panel', () => {
		const { handlers } = setup();
		const shape = { preventDefault: vi.fn(), dataTransfer: { types: [SHAPE_DRAG_TYPE], dropEffect: '' } } as unknown as DragEvent;
		handlers.onDragOver(shape);
		expect(shape.preventDefault).toHaveBeenCalled();
		const other = { preventDefault: vi.fn(), dataTransfer: { types: ['Files'], dropEffect: '' } } as unknown as DragEvent;
		handlers.onDragOver(other);
		expect(other.preventDefault).not.toHaveBeenCalled();
	});

	it('drops on the floor snapped to the grid and kept inside the workplane', () => {
		const { handlers, onDropShape } = setup({ floor: [12.4, 400] });
		handlers.onDrop(dropEvent('box'));
		expect(onDropShape).toHaveBeenCalledWith('box', [10, 100]);
	});

	it('ignores something that is not a known shape, or a pointer that misses the floor', () => {
		const a = setup({ floor: [0, 0] });
		a.handlers.onDrop(dropEvent('banana'));
		expect(a.onDropShape).not.toHaveBeenCalled();
		const b = setup({ floor: null });
		b.handlers.onDrop(dropEvent('box'));
		expect(b.onDropShape).not.toHaveBeenCalled();
	});

	it('with a Workplane-tool plane, drops onto the plane (snapped there) and not the floor', () => {
		const { handlers, onDropShape, onPlaneDrop, pickWorkplane, pickPlane, plane } = setup({
			withPlane: true,
			plane: [3.4, -6.2, 20],
			floor: [1, 1],
		});
		handlers.onDrop(dropEvent('cylinder'));
		expect(pickPlane).toHaveBeenCalledWith(10, 20, plane.origin, plane.normal);
		expect(pickWorkplane).not.toHaveBeenCalled();
		expect(onDropShape).not.toHaveBeenCalled();
		const [type, usedPlane, point] = onPlaneDrop.mock.calls[0]!;
		expect(type).toBe('cylinder');
		expect(usedPlane).toBe(plane);
		expect(point[0]).toBeCloseTo(5);
		expect(point[1]).toBeCloseTo(-5);
		expect(point[2]).toBeCloseTo(20);
	});

	it('drops nothing when the pointer misses the plane (edge-on)', () => {
		const { handlers, onPlaneDrop, onDropShape } = setup({ withPlane: true, plane: null });
		handlers.onDrop(dropEvent('box'));
		expect(onPlaneDrop).not.toHaveBeenCalled();
		expect(onDropShape).not.toHaveBeenCalled();
	});
});
