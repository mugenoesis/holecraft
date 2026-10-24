import {
	type Bounds,
	type Design,
	type NodeId,
	nodeBoundsIn,
	snapMeasuredPoint,
	type Units,
	type Vec3,
	type ZeroPoint,
	type ZeroTurns,
	zeroArms,
	zeroMoveDelta,
	zeroSign,
	zeroStrips,
} from '@holecraft/core';
import { ReadingBox } from './ReadingBox.tsx';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	selection: readonly NodeId[];
	units: Units;
	zero: ZeroPoint | null;
	/** Quarter turns of the L (which way its arms point); a click on its corner asks for the next. */
	turns: ZeroTurns;
	onTurn: () => void;
	/** Moves the selection by this much along x and y (typing a reading). */
	onMove: (delta: [number, number]) => void;
	/** Changes whenever the camera does, so the strips are redrawn where they now are. */
	camera: unknown;
}

/** The bounds of everything selected (hidden ones have none), or null. */
export function selectionBounds(design: Design, selection: readonly NodeId[]): Bounds | null {
	let all: Bounds | null = null;
	for (const id of selection) {
		const b = nodeBoundsIn(design, id);
		if (!b) continue;
		all = all
			? {
					min: [0, 1, 2].map((i) => Math.min(all!.min[i]!, b.min[i]!)) as Vec3,
					max: [0, 1, 2].map((i) => Math.max(all!.max[i]!, b.max[i]!)) as Vec3,
				}
			: b;
	}
	return all;
}

/** The screen ends of the L's two arms: each points the way its world direction goes, a fixed length on screen. */
function armsOnScreen(viewport: Viewport, zero: ZeroPoint, turns: ZeroTurns, ring: { x: number; y: number }): { x: number; y: number }[] {
	const out: { x: number; y: number }[] = [];
	for (const end of zeroArms(zero, turns, 10)) {
		const p = viewport.project(end);
		if (!p) continue;
		const len = Math.hypot(p.x - ring.x, p.y - ring.y);
		if (len < 1e-6) continue;
		out.push({ x: ring.x + ((p.x - ring.x) / len) * ARM_PX, y: ring.y + ((p.y - ring.y) / len) * ARM_PX });
	}
	return out;
}

const ARM_PX = 44;

/** A strip's reading, a box on the strip at the object: typing a distance moves the selection to it. */
function ZeroReading({
	axis,
	at,
	reading,
	units,
	onType,
}: {
	axis: 'x' | 'y';
	at: { x: number; y: number };
	reading: number;
	units: Units;
	onType: (mm: number) => void;
}) {
	return (
		<ReadingBox
			className="zero-reading"
			testId={`zero-input-${axis}`}
			label={`${axis.toUpperCase()} distance from the zero point (${units})`}
			at={at}
			mm={reading}
			units={units}
			onType={onType}
		/>
	);
}

/**
 * The zero point: an L on the floor that distances are measured from (clicking its corner turns it a quarter, so its arms say which way is positive) While the tool is on, a click on the floor (or a
 * shape's face, dropped to the floor under it) puts it down; with it set and something selected, grey strips on the floor
 * show how far x and y the selection is from it, each with a box on the strip where a typed distance moves the selection there. View state only: nothing is saved or put in the undo history.
 */
export function ZeroPointOverlay({ getViewport, design, selection, units, zero, turns, onTurn, onMove, camera: _camera }: Props) {
	const viewport = getViewport();
	if (!zero || !viewport) return null;
	const ring = viewport.project([zero[0], zero[1], 0]);
	const bounds = selectionBounds(design, selection);
	const strips = bounds ? zeroStrips(zero, bounds) : [];
	const arms = ring ? armsOnScreen(viewport, zero, turns, ring) : [];
	const moveTo = (axis: 'x' | 'y', reading: number) => {
		if (!bounds) return;
		const d = zeroMoveDelta(zero, bounds, axis, reading, turns);
		if (d !== 0) onMove(axis === 'x' ? [d, 0] : [0, d]);
	};
	return (
		<>
			<svg className="zero-lines" aria-hidden="true" data-testid="zero-point" data-x={zero[0]} data-y={zero[1]} data-turns={turns}>
				{strips.map((s) => {
					const a = viewport.project(s.from);
					const b = viewport.project(s.to);
					if (!a || !b) return null;
					return (
						<g key={s.axis} data-testid={`zero-strip-${s.axis}`} data-length={s.length} data-reading={s.length * zeroSign(turns, s.axis)}>
							<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
						</g>
					);
				})}
				{arms.map((a, i) => (
					<line key={i === 0 ? 'arm-x' : 'arm-y'} className="zero-arm" x1={ring!.x} y1={ring!.y} x2={a.x} y2={a.y} />
				))}
				{ring && (
					<circle
						cx={ring.x}
						cy={ring.y}
						r={9}
						data-testid="zero-ring"
						role="button"
						tabIndex={0}
						aria-label="Turn the zero point a quarter"
						onClick={onTurn}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onTurn();
							}
						}}
					/>
				)}
			</svg>
			<div className="zero-readings">
				{strips.map((s) => {
					const a = viewport.project(s.from);
					const b = viewport.project(s.to);
					if (!a || !b) return null;
					return (
						<ZeroReading
							key={s.axis}
							axis={s.axis}
							at={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }}
							reading={s.length * zeroSign(turns, s.axis)}
							units={units}
							onType={(r) => moveTo(s.axis, r)}
						/>
					);
				})}
			</div>
		</>
	);
}

interface ToolProps {
	getViewport: () => Viewport | null;
	snap: number;
	zero: ZeroPoint | null;
	onZero: (zero: ZeroPoint) => void;
	onClear: () => void;
	onClose: () => void;
}

/** The Zero point tool: a click on the floor, or on a shape (dropped to the floor under it), puts the zero point there; Escape leaves. */
export function ZeroPointTool({ getViewport, snap, zero, onZero, onClear, onClose }: ToolProps) {
	useSurfaceTool(getViewport, {
		onClick: (hit) => {
			const p = snapMeasuredPoint(hit.point, hit.normal, snap);
			onZero([p[0], p[1]]);
			onClose();
		},
		onEscape: onClose,
	});
	return (
		<div className="ruler-readout" data-testid="zero-readout" aria-live="polite">
			<span>Click the floor or a face to drop the zero point</span>
			{zero && (
				<button type="button" className="zero-clear" onClick={onClear}>
					Clear zero point
				</button>
			)}
		</div>
	);
}
