import type { Design, NodeId, PaintFill } from '@holecraft/core';
import { useEffect, useState } from 'react';
import { isTextEntry } from '../keyboard.ts';
import { BandCursor } from './BandCursor.tsx';
import { BrushCursor } from './BrushCursor.tsx';
import { PaintPanel } from './PaintPanel.tsx';
import { filamentForKey, fillFor, gapFillFor, type PaintSettings } from './paintTool.ts';
import { useBrushStroke } from './useBrushStroke.ts';
import { usePaintSettings } from './usePaintSettings.ts';
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
	/** A gap fill on the shapes it can tidy, as one undo step. */
	onGapFill: (ids: NodeId[], fill: PaintFill) => void;
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
	onGapFill,
	onEraseAll,
	onClose,
}: Props) {
	const [filament, setFilament] = useState(0);
	const paint = usePaintSettings(getViewport);
	const { tool, angle, shape, size, height, gapArea } = paint;
	const [status, setStatus] = useState<string | null>(null);
	const { palette } = design;
	const chosen = Math.min(filament, palette.length - 1);

	const color = palette[chosen] ?? null;
	const settings: PaintSettings = { color, tool, angle, shape, size, height, gapArea };
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
				if (brushing || tool === 'gaps') return;
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

	const painted = selection.filter((id) => design.nodes[id]?.paint);
	const gapFill = () => {
		const made = gapFillFor(design, selection, settings);
		if ('problem' in made) return setStatus(made.problem);
		setStatus(null);
		onGapFill(made.ids, made.fill);
	};
	return (
		<>
			{brushing && shape !== 'triangle' && <BrushCursor getViewport={getViewport} size={size} />}
			{tool === 'height' && <BandCursor getViewport={getViewport} design={design} height={height} />}
			<PaintPanel
				palette={palette}
				filament={chosen}
				tool={tool}
				angle={angle}
				shape={shape}
				size={size}
				height={height}
				gapArea={gapArea}
				canGapFill={'ids' in gapFillFor(design, selection, settings)}
				status={status}
				canErase={painted.length > 0}
				onFilament={setFilament}
				onTool={paint.setTool}
				onAngle={paint.setAngle}
				onShape={paint.setShape}
				onSize={paint.setSize}
				onHeight={paint.setHeight}
				onGapArea={paint.setGapArea}
				onGapFill={gapFill}
				onEraseAll={() => onEraseAll(painted)}
				onDone={onClose}
			/>
		</>
	);
}
