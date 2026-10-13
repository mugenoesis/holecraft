import type { Design, NodeId, PaintFill } from '@holecraft/core';
import { useEffect, useRef } from 'react';
import { type BrushStroke, type PaintSettings, startStroke } from './paintTool.ts';
import type { Viewport } from './Viewport.ts';

interface Callbacks {
	/** A stroke began on this object (one undo step runs from here to onEnd). */
	onStart: (id: NodeId) => void;
	/** The stroke so far, as one fill (the same fill id every time, with more dabs). */
	onPreview: (id: NodeId, fill: PaintFill) => void;
	onEnd: () => void;
	/** Why a press could not start a stroke (a locked shape, the floor). */
	onProblem: (message: string) => void;
	/** A stroke began, so a problem shown before can go. */
	onClearProblem: () => void;
}

/**
 * The brush's drag: press on a shape to put the first dab down, move to paint along the surface, release to finish. The press picks the
 * colour (Shift erases) and the shape the stroke is on; the pointer over anything else is ignored until it comes back. Mouse only: a finger
 * has to orbit, as the view has no right button for it.
 */
export function useBrushStroke(
	getViewport: () => Viewport | null,
	active: boolean,
	design: Design,
	settings: PaintSettings,
	callbacks: Callbacks,
): void {
	const latest = useRef({ design, settings, callbacks });
	latest.current = { design, settings, callbacks };

	useEffect(() => {
		const viewport = getViewport();
		if (!active || !viewport) return;
		const el = viewport.element;
		let stroke: BrushStroke | null = null;

		const onDown = (e: PointerEvent) => {
			if (e.button !== 0 || e.pointerType === 'touch') return;
			const { design: d, settings: s, callbacks: c } = latest.current;
			const hit = viewport.pickSurface(e.clientX, e.clientY);
			const started = hit ? startStroke(d, hit, { ...s, color: e.shiftKey ? null : s.color }) : { problem: 'Click a shape to paint it' };
			if ('problem' in started) return c.onProblem(started.problem);
			stroke = started;
			c.onClearProblem();
			c.onStart(started.id);
			c.onPreview(started.id, started.fill());
		};
		const onMove = (e: PointerEvent) => {
			if (!stroke || (e.buttons & 1) === 0) return;
			const hit = viewport.pickSurface(e.clientX, e.clientY);
			if (hit && stroke.add(hit)) latest.current.callbacks.onPreview(stroke.id, stroke.fill());
		};
		const onUp = (e: PointerEvent) => {
			if (!stroke || e.button !== 0) return;
			stroke = null;
			latest.current.callbacks.onEnd();
		};
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('pointercancel', onUp);
		return () => {
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('pointercancel', onUp);
			// leaving the tool mid-stroke keeps what was painted
			if (stroke) latest.current.callbacks.onEnd();
		};
	}, [getViewport, active]);
}
