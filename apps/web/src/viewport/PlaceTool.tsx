import type { Design, WorkPlane } from '@holecraft/core';
import { useEffect, useState } from 'react';
import { type Placing, placingSize } from '../placing.ts';
import { type PlacementTarget, placementTarget } from './placement.ts';
import type { SurfaceTool } from './surfaceTool.ts';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

/** Pixels a right press may travel and still count as a click (not a pan of the camera). */
const RIGHT_CLICK_SLOP = 4;

interface Props {
	getViewport: () => Viewport | null;
	placing: Placing;
	grid: Design['grid'];
	/** The Workplane tool's plane: the ghost stands on it, and so does what is put down. */
	plane: WorkPlane | null;
	/** One click on the plate: put `placing` down there. */
	onPlace: (placing: Placing, target: PlacementTarget) => void;
	onCancel: () => void;
	/** What the ghost is while it is on show ('box', 'saved' and so on), or undefined when it is hidden. */
	onGhost: (label: string | undefined) => void;
}

/**
 * Putting a shape down with the pointer: a see-through ghost of the shape follows the pointer over the plate (snapped to the grid, and on the
 * Workplane tool's plane when there is one), and a click puts it down there. Escape or a right click lets go of it. The Shapes panel starts
 * this (only for a mouse or a pen: a finger taps a shape to add it at once), and the editor ends it with the placement.
 */
function PlaceTool({ getViewport, placing, grid, plane, onPlace, onCancel, onGhost }: Props) {
	// where the little "Click to place" note follows the pointer, in the view's own pixels
	const [chip, setChip] = useState<{ x: number; y: number } | null>(null);
	const label = placing.kind === 'shape' ? placing.type : 'saved';

	// The ghost lasts as long as the tool, and is the size of what is being placed.
	useEffect(() => {
		const viewport = getViewport();
		viewport?.setGhost({ type: placing.kind === 'shape' ? placing.type : null, size: placingSize(placing) });
		return () => {
			viewport?.setGhost(null);
			onGhost(undefined);
		};
	}, [getViewport, placing, onGhost]);

	/** Where `at` (pixels in the view) would put the shape down, or null. */
	const targetAt = (at: { x: number; y: number }): PlacementTarget | null => {
		const viewport = getViewport();
		if (!viewport) return null;
		const rect = viewport.element.getBoundingClientRect();
		return placementTarget(viewport, at.x + rect.left, at.y + rect.top, grid, plane);
	};

	useSurfaceTool(getViewport, {
		onHoverAt: (at) => {
			const target = at ? targetAt(at) : null;
			getViewport()?.moveGhost(target);
			setChip(target ? at : null);
			onGhost(target ? label : undefined);
		},
		onClickAt: (at) => {
			const target = targetAt(at);
			if (target) onPlace(placing, target);
		},
		onEscape: onCancel,
	});

	// A right click lets go of the shape (and does not open the browser's menu over the view); a right drag still moves the camera.
	useEffect(() => {
		const element = getViewport()?.element;
		if (!element) return;
		let down: { x: number; y: number } | null = null;
		const onDown = (e: PointerEvent) => {
			down = e.button === 2 ? { x: e.clientX, y: e.clientY } : null;
		};
		const onContextMenu = (e: MouseEvent) => {
			e.preventDefault();
			if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) <= RIGHT_CLICK_SLOP) onCancel();
		};
		element.addEventListener('pointerdown', onDown);
		element.addEventListener('contextmenu', onContextMenu);
		return () => {
			element.removeEventListener('pointerdown', onDown);
			element.removeEventListener('contextmenu', onContextMenu);
		};
	}, [getViewport, onCancel]);

	return (
		chip && (
			<div className="place-chip" style={{ left: chip.x + 18, top: chip.y + 18 }}>
				Click to place · Esc to cancel
			</div>
		)
	);
}

/**
 * Which tool owns the left button (ruler, edges and so on), and what choosing one does: it lets go of a shape armed to be put down, and
 * arming a shape ends the tool in use (both would own the left button).
 */
export function useToolState(placing: Placing | null, onCancelPlacing: () => void) {
	const [tool, setTool] = useState<SurfaceTool | null>(null);
	const toggleTool = (t: SurfaceTool) => {
		onCancelPlacing();
		setTool((now) => (now === t ? null : t));
	};
	useEffect(() => {
		if (placing) setTool(null);
	}, [placing]);
	return { tool, setTool, toggleTool };
}

/** PlaceTool while something is armed to be put down, and nothing otherwise. */
export function PlaceLayer({ placing, ...rest }: Omit<Props, 'placing'> & { placing: Placing | null }) {
	return placing ? <PlaceTool placing={placing} {...rest} /> : null;
}
