import { type Design, nodeBoundsIn } from '@holecraft/core';
import { useEffect } from 'react';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	/** The band's height in mm. */
	height: number;
}

/** While the Height range tool is on: a translucent slab across the object under the pointer, from the pointer's height up by the band's height. */
export function BandCursor({ getViewport, design, height }: Props) {
	useEffect(() => {
		const viewport = getViewport();
		if (!viewport) return;
		const el = viewport.element;
		const onMove = (e: PointerEvent) => {
			const hit = e.pointerType === 'touch' ? null : viewport.pickSurface(e.clientX, e.clientY);
			const bounds = hit?.id ? nodeBoundsIn(design, hit.id) : null;
			viewport.setBandMarker(hit && bounds ? { bounds, z0: hit.point[2], z1: hit.point[2] + height } : null);
		};
		const onLeave = () => viewport.setBandMarker(null);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerleave', onLeave);
		return () => {
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerleave', onLeave);
			viewport.setBandMarker(null);
		};
	}, [getViewport, design, height]);
	return null;
}
