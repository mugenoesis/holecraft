import {
	type Axis,
	axisVector,
	type NodeId,
	normalizeAngle,
	ringAngle,
	ringPoint,
	rotateAboutWorldAxis,
	snapAngle,
	type Vec3,
} from '@holecraft/core';
import { type PointerEvent, useRef } from 'react';
import type { Viewport } from './Viewport.ts';

const AXES: readonly Axis[] = ['x', 'y', 'z'];
const COLORS: Record<Axis, string> = { x: '#d6455d', y: '#2f9e5b', z: '#3b78e7' };
/** Where on its ring each handle sits, chosen so the three stay clear of each other and the resize handles. */
const ANCHOR: Record<Axis, number> = { x: -Math.PI / 4, y: (3 * Math.PI) / 4, z: -(3 * Math.PI) / 4 };
const RING_SEGMENTS = 72;
/** Degrees per snap step; Shift switches to the fine step. */
const COARSE_STEP = 22.5;
const FINE_STEP = 1;

const fmt = (n: number) => String(Number(n.toFixed(2)));

interface Props {
	nodeId: NodeId;
	/** Middle of the shape in world space, the centre of all three rings. */
	center: Vec3;
	/** Ring radius in mm: just outside the shape. */
	radius: number;
	/** The shape's current orientation (row-major 3x3). */
	rotation: readonly number[];
	getViewport: () => Viewport | null;
	onStart: () => void;
	onRotation: (id: NodeId, rotation: number[]) => void;
	onEnd: () => void;
	onLabel: (text: string | null) => void;
}

interface Grab {
	axis: Axis;
	start: readonly number[];
	/** Pointer angle on the ring at the last move (null until the pointer first hits the ring's plane). */
	lastRaw: number | null;
	/** Total turn since the grab, unwrapped so it keeps counting past ±180°. */
	accumulated: number;
}

/**
 * Three rings around the selected shape, one per world axis, each with a handle. Dragging a
 * handle turns the shape about that axis through its centre, snapping to 22.5° (1° with Shift).
 */
export function RotationRings({ nodeId, center, radius, rotation, getViewport, onStart, onRotation, onEnd, onLabel }: Props) {
	const grab = useRef<Grab | null>(null);
	const viewport = getViewport();
	if (!viewport) return null;

	/** Angle of the pointer on the ring's plane, or null when the plane is edge-on to the camera. */
	const pointerAngle = (axis: Axis, e: PointerEvent): number | null => {
		const hit = getViewport()?.pickPlane(e.clientX, e.clientY, center, axisVector(axis));
		return hit ? ringAngle(center, axis, hit) : null;
	};

	const onPointerDown = (axis: Axis, e: PointerEvent<HTMLButtonElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		grab.current = { axis, start: [...rotation], lastRaw: pointerAngle(axis, e), accumulated: 0 };
		onStart();
	};

	const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
		const g = grab.current;
		if (!g) return;
		const raw = pointerAngle(g.axis, e);
		if (raw === null) return;
		if (g.lastRaw !== null) g.accumulated += normalizeAngle(raw - g.lastRaw);
		g.lastRaw = raw;

		const degrees = snapAngle((g.accumulated * 180) / Math.PI, e.shiftKey ? FINE_STEP : COARSE_STEP);
		onRotation(nodeId, rotateAboutWorldAxis(g.start, g.axis, (degrees * Math.PI) / 180));
		onLabel(`Rotate ${g.axis.toUpperCase()}: ${fmt(degrees)}°`);
	};

	const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
		if (!grab.current) return;
		grab.current = null;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
		onEnd();
		onLabel(null);
	};

	return (
		<>
			<svg className="rotation-rings" data-testid="rotation-rings" aria-hidden="true">
				{AXES.map((axis) => {
					const points = Array.from({ length: RING_SEGMENTS + 1 }, (_, i) =>
						viewport.project(ringPoint(center, axis, radius, (i / RING_SEGMENTS) * 2 * Math.PI)),
					);
					// Break the line wherever part of the ring is behind the camera.
					const runs: string[] = [];
					let run: string[] = [];
					for (const p of points) {
						if (p) {
							run.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
						} else if (run.length) {
							runs.push(run.join(' '));
							run = [];
						}
					}
					if (run.length) runs.push(run.join(' '));
					return runs.map((pts, i) => (
						<polyline key={`${axis}-${i}`} points={pts} fill="none" stroke={COLORS[axis]} strokeWidth={1.5} strokeOpacity={0.55} />
					));
				})}
			</svg>
			<div className="rotation-handles" role="group" aria-label="Rotation handles">
				{AXES.map((axis) => {
					const p = viewport.project(ringPoint(center, axis, radius, ANCHOR[axis]));
					if (!p) return null;
					return (
						<button
							key={axis}
							type="button"
							className="rotate-handle"
							data-testid={`rotate-${axis}`}
							aria-label={`Rotate around ${axis.toUpperCase()} axis`}
							style={{ left: p.x, top: p.y, background: COLORS[axis] }}
							onPointerDown={(e) => onPointerDown(axis, e)}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={onPointerUp}
						/>
					);
				})}
			</div>
		</>
	);
}
