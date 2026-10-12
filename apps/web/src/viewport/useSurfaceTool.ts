import type { Vec3 } from '@holecraft/core';
import { useEffect, useRef } from 'react';
import type { Viewport } from './Viewport.ts';

export interface SurfaceHit {
	point: Vec3;
	normal: Vec3;
}

interface Handlers {
	/** The surface under the pointer while it moves with no button down (null over the sky). */
	onHover?: (hit: SurfaceHit | null) => void;
	/** A click (press and release in the same place) on a surface. Dragging orbits and never counts. */
	onClick: (hit: SurfaceHit) => void;
	/** Escape was pressed. */
	onEscape?: () => void;
}

/** Pixels the pointer may travel between press and release and still count as a click (not an orbit). */
const CLICK_SLOP = 4;

/**
 * Lets a tool (ruler, workplane) work on the surfaces under the pointer. While it is mounted the viewport's left
 * button stops selecting and moving, so a click belongs to the tool and dragging orbits. Handlers are read at the
 * time of each event, so they can change on every render.
 */
export function useSurfaceTool(getViewport: () => Viewport | null, handlers: Handlers): void {
	const latest = useRef(handlers);
	latest.current = handlers;

	useEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		viewport.setSurfaceTool(true);
		const el = viewport.element;
		let down: { x: number; y: number } | null = null;
		const onMove = (e: PointerEvent) => {
			if (e.buttons === 0) latest.current.onHover?.(viewport.pickSurface(e.clientX, e.clientY));
		};
		const onDown = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		const onUp = (e: PointerEvent) => {
			if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
			down = null;
			const hit = viewport.pickSurface(e.clientX, e.clientY);
			if (hit) latest.current.onClick(hit);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') latest.current.onEscape?.();
		};
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
		return () => {
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointerup', onUp);
			window.removeEventListener('keydown', onKey);
			viewport.setSurfaceTool(false);
		};
	}, [getViewport]);
}
