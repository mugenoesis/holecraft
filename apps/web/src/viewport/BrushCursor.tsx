import type { Vec3 } from '@holecraft/core';
import { useEffect, useState } from 'react';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	/** The brush's diameter in mm. */
	size: number;
}

/** A ring at the pointer showing how far the brush reaches, drawn on the surface it is over (not shown over the floor or the sky). */
export function BrushCursor({ getViewport, size }: Props) {
	const [hover, setHover] = useState<{ point: Vec3 } | null>(null);
	const [, redraw] = useState(0);

	useEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const el = viewport.element;
		const onMove = (e: PointerEvent) => {
			const hit = e.pointerType === 'touch' ? null : viewport.pickSurface(e.clientX, e.clientY);
			setHover(hit?.id ? { point: hit.point } : null);
		};
		const onLeave = () => setHover(null);
		// the camera moving or the size changing moves the ring under a still pointer
		const onView = () => redraw((n) => n + 1);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerleave', onLeave);
		el.addEventListener('wheel', onView, { passive: true });
		return () => {
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerleave', onLeave);
			el.removeEventListener('wheel', onView);
		};
	}, [getViewport]);

	const viewport = getViewport();
	const at = hover && viewport ? viewport.project(hover.point) : null;
	if (!hover || !viewport || !at) return null;
	const radius = (size / 2) * viewport.pixelsPerMm(hover.point);
	if (!(radius > 1)) return null;
	return (
		<svg className="brush-cursor" aria-hidden="true" data-testid="brush-cursor" data-radius={radius.toFixed(1)}>
			<circle cx={at.x} cy={at.y} r={radius} />
			<circle cx={at.x} cy={at.y} r={1.5} className="dot" />
		</svg>
	);
}
