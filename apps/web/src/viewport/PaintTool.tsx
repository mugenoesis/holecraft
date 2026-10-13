import type { BrushShape, Design, NodeId, PaintFill } from '@holecraft/core';
import { useEffect, useState } from 'react';
import { isTextEntry } from '../keyboard.ts';
import { BrushCursor } from './BrushCursor.tsx';
import { PaintPanel } from './PaintPanel.tsx';
import { BRUSH_SIZE, DEFAULT_PAINT_SETTINGS, filamentForKey, fillFor, type PaintSettings } from './paintTool.ts';
import { useBrushStroke } from './useBrushStroke.ts';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	selection: readonly NodeId[];
	onPaint: (id: NodeId, fill: PaintFill) => void;
	/** A brush stroke: it begins on an object, grows as the same fill with more dabs, and ends (one undo step). */
	onStrokeStart: (id: NodeId) => void;
	onStrokePreview: (id: NodeId, fill: PaintFill) => void;
	onStrokeEnd: () => void;
	onEraseAll: (ids: NodeId[]) => void;
	onClose: () => void;
}

/**
 * The Paint tool, modelled on OrcaSlicer's colour painting: pick a filament (a swatch or its number key), then click a face with Smart fill
 * (spreads over faces that turn up to the angle) or Bucket fill (everything joined that is the same colour). Shift+click erases. The paint is
 * a fill kept on the object, in its own frame, so it follows the object when it is moved, turned or resized. Escape or Done leaves the tool.
 */
export function PaintTool({
	getViewport,
	design,
	selection,
	onPaint,
	onStrokeStart,
	onStrokePreview,
	onStrokeEnd,
	onEraseAll,
	onClose,
}: Props) {
	const [filament, setFilament] = useState(0);
	const [tool, setTool] = useState<PaintSettings['tool']>(DEFAULT_PAINT_SETTINGS.tool);
	const [angle, setAngle] = useState(DEFAULT_PAINT_SETTINGS.angle);
	const [shape, setShape] = useState<BrushShape>(DEFAULT_PAINT_SETTINGS.shape);
	const [size, setSize] = useState(DEFAULT_PAINT_SETTINGS.size);
	const [status, setStatus] = useState<string | null>(null);
	const { palette } = design;
	const chosen = Math.min(filament, palette.length - 1);

	const color = palette[chosen] ?? null;
	const settings: PaintSettings = { color, tool, angle, shape, size };
	const brushing = tool === 'brush';

	// the brush paints as it is dragged; the other tools paint on a click
	useBrushStroke(getViewport, brushing, design, settings, {
		onStart: onStrokeStart,
		onPreview: onStrokePreview,
		onEnd: onStrokeEnd,
		onProblem: setStatus,
		onClearProblem: () => setStatus(null),
	});

	useSurfaceTool(
		getViewport,
		{
			onClick: (hit, shift) => {
				if (brushing) return;
				const made = fillFor(design, hit, { ...settings, color: shift ? null : color });
				if ('problem' in made) return setStatus(made.problem);
				setStatus(null);
				onPaint(made.id, made.fill);
			},
			onEscape: onClose,
		},
		{ paintsOnDrag: brushing },
	);

	// The number keys choose a filament, as in OrcaSlicer.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey || isTextEntry(e.target)) return;
			const index = filamentForKey(e.key, palette.length);
			if (index === null) return;
			setFilament(index);
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [palette.length]);

	// Ctrl + wheel changes the smart fill angle (or the brush size) instead of zooming (heard before the view's own wheel handler).
	useEffect(() => {
		const el = getViewport()?.element;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const up = e.deltaY < 0 ? 1 : -1;
			if (brushing) setSize((n) => Math.max(BRUSH_SIZE.min, Math.min(BRUSH_SIZE.max, n + up * BRUSH_SIZE.step)));
			else setAngle((a) => Math.max(0, Math.min(90, a + up * 2)));
		};
		el.addEventListener('wheel', onWheel, { capture: true, passive: false });
		return () => el.removeEventListener('wheel', onWheel, { capture: true });
	}, [getViewport, brushing]);

	const painted = selection.filter((id) => design.nodes[id]?.paint);
	return (
		<>
			{brushing && shape !== 'triangle' && <BrushCursor getViewport={getViewport} size={size} />}
			<PaintPanel
				palette={palette}
				filament={chosen}
				tool={tool}
				angle={angle}
				shape={shape}
				size={size}
				status={status}
				canErase={painted.length > 0}
				onFilament={setFilament}
				onTool={setTool}
				onAngle={setAngle}
				onShape={setShape}
				onSize={setSize}
				onEraseAll={() => onEraseAll(painted)}
				onDone={onClose}
			/>
		</>
	);
}
