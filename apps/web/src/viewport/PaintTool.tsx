import type { Design, NodeId, PaintFill } from '@holecraft/core';
import { useEffect, useState } from 'react';
import { isTypingTarget } from '../keyboard.ts';
import { PaintPanel } from './PaintPanel.tsx';
import { DEFAULT_PAINT_SETTINGS, filamentForKey, fillFor, type PaintSettings } from './paintTool.ts';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	selection: readonly NodeId[];
	onPaint: (id: NodeId, fill: PaintFill) => void;
	onEraseAll: (ids: NodeId[]) => void;
	onClose: () => void;
}

/**
 * The Paint tool, modelled on OrcaSlicer's colour painting: pick a filament (a swatch or its number key), then click a face with Smart fill
 * (spreads over faces that turn up to the angle) or Bucket fill (everything joined that is the same colour). Shift+click erases. The paint is
 * a fill kept on the object, in its own frame, so it follows the object when it is moved, turned or resized. Escape or Done leaves the tool.
 */
export function PaintTool({ getViewport, design, selection, onPaint, onEraseAll, onClose }: Props) {
	const [filament, setFilament] = useState(0);
	const [tool, setTool] = useState<PaintSettings['tool']>(DEFAULT_PAINT_SETTINGS.tool);
	const [angle, setAngle] = useState(DEFAULT_PAINT_SETTINGS.angle);
	const [status, setStatus] = useState<string | null>(null);
	const { palette } = design;
	const chosen = Math.min(filament, palette.length - 1);

	useSurfaceTool(getViewport, {
		onClick: (hit, shift) => {
			const made = fillFor(design, hit, { color: shift ? null : (palette[chosen] ?? null), tool, angle });
			if ('problem' in made) return setStatus(made.problem);
			setStatus(null);
			onPaint(made.id, made.fill);
		},
		onEscape: onClose,
	});

	// The number keys choose a filament, as in OrcaSlicer.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
			const index = filamentForKey(e.key, palette.length);
			if (index === null) return;
			setFilament(index);
			e.preventDefault();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [palette.length]);

	// Ctrl + wheel changes the smart fill angle instead of zooming (heard before the view's own wheel handler).
	useEffect(() => {
		const el = getViewport()?.element;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			setAngle((a) => Math.max(0, Math.min(90, a + (e.deltaY < 0 ? 1 : -1) * 2)));
		};
		el.addEventListener('wheel', onWheel, { capture: true, passive: false });
		return () => el.removeEventListener('wheel', onWheel, { capture: true });
	}, [getViewport]);

	const painted = selection.filter((id) => design.nodes[id]?.paint);
	return (
		<PaintPanel
			palette={palette}
			filament={chosen}
			tool={tool}
			angle={angle}
			status={status}
			canErase={painted.length > 0}
			onFilament={setFilament}
			onTool={setTool}
			onAngle={setAngle}
			onEraseAll={() => onEraseAll(painted)}
			onDone={onClose}
		/>
	);
}
