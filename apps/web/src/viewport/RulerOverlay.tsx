import { formatLength, measureBetween, nextRuler, type RulerState, snapMeasuredPoint, type Units, type Vec3 } from '@holecraft/core';
import { useRef, useState } from 'react';
import { type SurfaceHit, useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	units: Units;
	/** Grid step in mm that points on the bare workplane snap to; 0 for none. */
	snap: number;
	/** Changes whenever the camera does, so the lines are redrawn where the points now are. */
	camera: unknown;
	onClose: () => void;
}

/**
 * The ruler: while it is on, clicks on a shape's face or on the workplane drop the start and then the end
 * of a measurement (a third click starts over), and the readout shows the distance and the offset on each
 * axis. It only looks at the design; nothing is saved or changed. Escape clears it, then switches it off.
 */
export function RulerOverlay({ getViewport, units, snap, camera: _camera, onClose }: Props) {
	const [ruler, setRuler] = useState<RulerState>({ a: null, b: null });
	const [hover, setHover] = useState<Vec3 | null>(null);
	const rulerRef = useRef(ruler);
	rulerRef.current = ruler;

	const snapped = (hit: SurfaceHit) => snapMeasuredPoint(hit.point, hit.normal, snap);
	useSurfaceTool(getViewport, {
		onHover: (hit) => setHover(hit ? snapped(hit) : null),
		onClick: (hit) => setRuler(nextRuler(rulerRef.current, snapped(hit))),
		onEscape: () => (rulerRef.current.a ? setRuler({ a: null, b: null }) : onClose()),
	});

	const viewport = getViewport();
	const end = ruler.b ?? hover;
	const a = ruler.a ? viewport?.project(ruler.a) : null;
	const b = ruler.a && end ? viewport?.project(end) : null;
	const measurement = ruler.a && end ? measureBetween(ruler.a, end) : null;

	return (
		<>
			<svg className="ruler-lines" aria-hidden="true">
				{a && b && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={ruler.b ? 'done' : 'live'} />}
				{a && <circle cx={a.x} cy={a.y} r={5} />}
				{b && ruler.b && <circle cx={b.x} cy={b.y} r={5} />}
			</svg>
			<div className="ruler-readout" data-testid="ruler-readout" aria-live="polite">
				{measurement ? (
					<>
						<strong>{formatLength(measurement.distance, units)}</strong>
						<span>
							X {formatLength(measurement.delta[0], units)} · Y {formatLength(measurement.delta[1], units)} · Z{' '}
							{formatLength(measurement.delta[2], units)}
						</span>
					</>
				) : (
					<span>{ruler.a ? 'Click where to measure to' : 'Click a face or the workplane to start measuring'}</span>
				)}
			</div>
		</>
	);
}
