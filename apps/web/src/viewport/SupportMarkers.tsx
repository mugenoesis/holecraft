import type { SupportPoint, Vec3 } from '@holecraft/core';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import type { Viewport } from './Viewport.ts';

interface Props {
	points: readonly SupportPoint[];
	selected: string | null;
	/** Looked up lazily: the Viewport is created after the first render. */
	getViewport: () => Viewport | null;
	/** Changes whenever the camera does, so the markers are drawn where the points now are. */
	camera: unknown;
	onSelect: (id: string) => void;
	onDragStart: () => void;
	onMove: (id: string, to: Vec3) => void;
	onDragEnd: () => void;
	onRemove: (id: string) => void;
}

/** Pixels a press may travel before it is a drag and not a click. */
const DRAG_SLOP = 3;

interface Grab {
	id: string;
	x: number;
	y: number;
	dragging: boolean;
}

/**
 * The support points as buttons over the 3D view (like the resize handles: constant size, reachable by keyboard), drawn through the model.
 * A click chooses a point, a drag moves it along the surface of the model under the pointer (it stays on the model: over empty space it
 * stays put), and Delete takes the chosen one away.
 */
export function SupportMarkers({
	points,
	selected,
	getViewport,
	camera: _camera,
	onSelect,
	onDragStart,
	onMove,
	onDragEnd,
	onRemove,
}: Props) {
	const grab = useRef<Grab | null>(null);
	const viewport = getViewport();
	if (!viewport) return null;

	const down = (e: PointerEvent<HTMLButtonElement>, id: string) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		grab.current = { id, x: e.clientX, y: e.clientY, dragging: false };
		onSelect(id);
	};
	const move = (e: PointerEvent<HTMLButtonElement>) => {
		const g = grab.current;
		if (!g) return;
		if (!g.dragging) {
			if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG_SLOP) return;
			g.dragging = true;
			onDragStart();
		}
		const hit = viewport.pickSurface(e.clientX, e.clientY);
		if (hit?.id) onMove(g.id, hit.point);
	};
	const up = (e: PointerEvent<HTMLButtonElement>) => {
		const g = grab.current;
		grab.current = null;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
		if (g?.dragging) onDragEnd();
	};
	const key = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
		if (e.key !== 'Delete' && e.key !== 'Backspace') return;
		e.preventDefault();
		e.stopPropagation();
		onRemove(id);
	};

	return (
		<div className="support-points">
			{points.map((p, i) => {
				const at = viewport.project([p.x, p.y, p.z]);
				if (!at) return null;
				return (
					<button
						key={p.id}
						type="button"
						data-testid="support-point"
						data-x={String(round(p.x))}
						data-y={String(round(p.y))}
						data-z={String(round(p.z))}
						data-radius={String(round(p.radius))}
						aria-label={`Support point ${i + 1} of ${points.length}`}
						aria-pressed={p.id === selected}
						className={`support-point${p.id === selected ? ' selected' : ''}${p.type === 'manual' ? ' manual' : ''}`}
						style={{ left: at.x, top: at.y }}
						onPointerDown={(e) => down(e, p.id)}
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={up}
						onKeyDown={(e) => key(e, p.id)}
					/>
				);
			})}
		</div>
	);
}

/** Coordinates as they are kept, to a thousandth of a millimetre, so the numbers on the markers are not float noise. */
const round = (v: number) => Math.round(v * 1000) / 1000;
