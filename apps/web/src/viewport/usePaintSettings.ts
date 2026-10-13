import type { BrushShape } from '@holecraft/core';
import { useEffect, useState } from 'react';
import { BRUSH_SIZE, DEFAULT_PAINT_SETTINGS, GAP_AREA, HEIGHT_RANGE, type PaintSettings } from './paintTool.ts';
import type { Viewport } from './Viewport.ts';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
/** Rounded to the slider's step, so repeated wheel clicks do not pick up floating point dust. */
const snapTo = (v: number, step: number) => Math.round(v / step) * step;

/** What the Paint tool is set to (the filament is chosen separately), with a Ctrl+wheel that changes the number the chosen tool is about. */
export function usePaintSettings(getViewport: () => Viewport | null) {
	const [tool, setTool] = useState<PaintSettings['tool']>(DEFAULT_PAINT_SETTINGS.tool);
	const [angle, setAngle] = useState(DEFAULT_PAINT_SETTINGS.angle);
	const [shape, setShape] = useState<BrushShape>(DEFAULT_PAINT_SETTINGS.shape);
	const [size, setSize] = useState(DEFAULT_PAINT_SETTINGS.size);
	const [height, setHeight] = useState(DEFAULT_PAINT_SETTINGS.height);
	const [gapArea, setGapArea] = useState(DEFAULT_PAINT_SETTINGS.gapArea);

	// Ctrl + wheel changes the angle, brush size, band height or gap area instead of zooming (heard before the view's own wheel handler).
	useEffect(() => {
		const el = getViewport()?.element;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const up = e.deltaY < 0 ? 1 : -1;
			const change: Record<PaintSettings['tool'], () => void> = {
				brush: () => setSize((n) => clamp(n + up * BRUSH_SIZE.step, BRUSH_SIZE.min, BRUSH_SIZE.max)),
				height: () =>
					setHeight((n) => clamp(snapTo(n + up * HEIGHT_RANGE.step * 5, HEIGHT_RANGE.step), HEIGHT_RANGE.min, HEIGHT_RANGE.max)),
				gaps: () => setGapArea((n) => clamp(snapTo(n + up * GAP_AREA.step, GAP_AREA.step), GAP_AREA.min, GAP_AREA.max)),
				smart: () => setAngle((a) => clamp(a + up * 2, 0, 90)),
				bucket: () => setAngle((a) => clamp(a + up * 2, 0, 90)),
			};
			change[tool]();
		};
		el.addEventListener('wheel', onWheel, { capture: true, passive: false });
		return () => el.removeEventListener('wheel', onWheel, { capture: true });
	}, [getViewport, tool]);

	return { tool, angle, shape, size, height, gapArea, setTool, setAngle, setShape, setSize, setHeight, setGapArea };
}
