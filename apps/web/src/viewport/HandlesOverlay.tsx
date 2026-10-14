import {
	dragHandleTilted,
	dragHandleYawed,
	HANDLE_IDS,
	type HandleId,
	handlePositionTilted,
	handlePositionYawed,
	type NodeId,
	type ShapeGeometry,
	type Vec3,
} from '@holecraft/core';
import { type PointerEvent, useRef } from 'react';
import { type Aim, aimKind, aimOffset, aimTarget } from './handleAim.ts';
import { describeDrag, handleAriaLabel } from './handleLabel.ts';
import type { Viewport } from './Viewport.ts';

/** How far above the top face the lift handle floats on screen, so it clears the height handle. */
const LIFT_OFFSET_PX = 28;

interface Props {
	nodeId: NodeId;
	geometry: ShapeGeometry;
	/** Degrees the shape is turned about the vertical axis through its centre. */
	yaw: number;
	/** The shape's whole turn (row-major 3x3), used when it is `tilted`. */
	rotation: readonly number[];
	/** Tipped over, not just turned about the vertical: the handles then work along the shape's own axes. */
	tilted: boolean;
	/** A thread keeps its width and depth: only the height and lift handles are offered. */
	lengthOnly: boolean;
	snap: number;
	/** Looked up lazily: the Viewport is created after the first render. */
	getViewport: () => Viewport | null;
	onStart: () => void;
	onGeometry: (id: NodeId, geometry: ShapeGeometry) => void;
	onEnd: () => void;
	onLabel: (text: string | null) => void;
}

interface Grab {
	id: HandleId;
	aim: Aim;
	/** Difference between the handle's position and where the pointer first touched it. */
	offset: Vec3;
}

/**
 * Resize and lift handles for the selected shape, drawn as buttons over the 3D view so they
 * keep a constant size and are reachable by assistive technology. All the maths is in core.
 */
export function HandlesOverlay({
	nodeId,
	geometry,
	yaw,
	rotation,
	tilted,
	lengthOnly,
	snap,
	getViewport,
	onStart,
	onGeometry,
	onEnd,
	onLabel,
}: Props) {
	const grab = useRef<Grab | null>(null);
	const viewport = getViewport();
	if (!viewport) return null;

	const positionOf = (g: ShapeGeometry, id: HandleId) => (tilted ? handlePositionTilted(g, rotation, id) : handlePositionYawed(g, yaw, id));

	const onPointerDown = (id: HandleId, e: PointerEvent<HTMLButtonElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		const start = { ...geometry };
		const aim: Aim = { kind: aimKind(id, tilted), start, rotation, at: positionOf(start, id) };
		const v = getViewport();
		const g: Grab = { id, aim, offset: v ? aimOffset(v, aim, id, tilted, e) : [0, 0, 0] };

		e.currentTarget.setPointerCapture(e.pointerId);
		grab.current = g;
		onStart();
	};

	const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
		const g = grab.current;
		if (!g) return;
		const vp = getViewport();
		const target = vp && aimTarget(vp, g.aim, g.id, tilted, g.offset, e);
		if (!target) return;
		const options = { snap, uniform: e.shiftKey, fromCenter: e.altKey };
		const next = tilted
			? dragHandleTilted(g.aim.start, rotation, g.id, target, options)
			: dragHandleYawed(g.aim.start, yaw, g.id, target, options);
		onGeometry(nodeId, next);
		onLabel(describeDrag(g.id, next));
	};

	const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
		if (!grab.current) return;
		grab.current = null;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
		onEnd();
		onLabel(null);
	};

	return (
		<div className="handles" role="group" aria-label="Shape handles">
			{HANDLE_IDS.filter((id) => !lengthOnly || id === 'height' || id === 'lift').map((id) => {
				const p = viewport.project(positionOf(geometry, id));
				if (!p) return null;
				const y = id === 'lift' ? p.y - LIFT_OFFSET_PX : p.y;
				return (
					<button
						key={id}
						type="button"
						className={`handle ${id.startsWith('corner') ? 'corner' : id.startsWith('side') ? 'side' : id}`}
						data-testid={`handle-${id}`}
						aria-label={handleAriaLabel(id)}
						style={{ left: p.x, top: y }}
						onPointerDown={(e) => onPointerDown(id, e)}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
					/>
				);
			})}
		</div>
	);
}
