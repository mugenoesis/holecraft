import type { Vec3 } from '@holecraft/core';
import { useEffect, useRef } from 'react';
import type { Viewport } from './Viewport.ts';

export interface SurfaceHit {
	point: Vec3;
	normal: Vec3;
}

/** A pointer position in pixels within the view. */
interface ViewPoint {
	x: number;
	y: number;
}

interface Handlers {
	/** The surface under the pointer while it moves with no button down (null over the sky, or once it leaves the view). */
	onHover?: (hit: SurfaceHit | null) => void;
	/** A click (press and release in the same place) on a surface. Dragging orbits and never counts. */
	onClick?: (hit: SurfaceHit) => void;
	/** Like onHover, but where the pointer is on screen, for tools that pick what is drawn there (the Edge tool). */
	onHoverAt?: (at: ViewPoint | null) => void;
	/** Like onClick, but anywhere, with where it was on screen. `add` is true with Shift, and for every touch (which has no Shift). */
	onClickAt?: (at: ViewPoint, add: boolean) => void;
	/** Escape was pressed. */
	onEscape?: () => void;
}

/** Pixels the pointer may travel between press and release and still count as a click (not an orbit). */
const CLICK_SLOP = 4;

/**
 * Lets a tool (ruler, workplane, edges) work on the surfaces under the pointer. While it is mounted the viewport's left
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
		const at = (e: PointerEvent): ViewPoint => {
			const rect = el.getBoundingClientRect();
			return { x: e.clientX - rect.left, y: e.clientY - rect.top };
		};
		let down: { x: number; y: number } | null = null;
		const onMove = (e: PointerEvent) => {
			if (e.buttons !== 0) return;
			const { onHover, onHoverAt } = latest.current;
			onHover?.(viewport.pickSurface(e.clientX, e.clientY));
			onHoverAt?.(at(e));
		};
		const onLeave = () => {
			latest.current.onHover?.(null);
			latest.current.onHoverAt?.(null);
		};
		const onDown = (e: PointerEvent) => {
			down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
		};
		const onUp = (e: PointerEvent) => {
			if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
			down = null;
			const { onClick, onClickAt } = latest.current;
			onClickAt?.(at(e), e.shiftKey || e.pointerType === 'touch');
			if (!onClick) return;
			const hit = viewport.pickSurface(e.clientX, e.clientY);
			if (hit) onClick(hit);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') latest.current.onEscape?.();
		};
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerleave', onLeave);
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointerup', onUp);
		window.addEventListener('keydown', onKey);
		return () => {
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerleave', onLeave);
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointerup', onUp);
			window.removeEventListener('keydown', onKey);
			viewport.setSurfaceTool(false);
		};
	}, [getViewport]);
}
