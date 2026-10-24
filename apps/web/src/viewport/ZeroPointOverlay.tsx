import {
	type Bounds,
	type Design,
	formatLength,
	type NodeId,
	nodeBoundsIn,
	snapMeasuredPoint,
	type Units,
	type Vec3,
	type ZeroPoint,
	zeroStrips,
} from '@holecraft/core';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	design: Design;
	selection: readonly NodeId[];
	units: Units;
	zero: ZeroPoint | null;
	/** Changes whenever the camera does, so the strips are redrawn where they now are. */
	camera: unknown;
}

/** The bounds of everything selected (hidden ones have none), or null. */
function selectionBounds(design: Design, selection: readonly NodeId[]): Bounds | null {
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

/**
 * The zero point: a ring on the floor that distances are measured from. While the tool is on, a click on the floor (or a
 * shape's face, dropped to the floor under it) puts it down; with it set and something selected, green strips on the floor
 * show how far x and y the selection is from it. View state only: nothing is saved or put in the undo history.
 */
export function ZeroPointOverlay({ getViewport, design, selection, units, zero, camera: _camera }: Props) {
	const viewport = getViewport();
	if (!zero || !viewport) return null;
	const ring = viewport.project([zero[0], zero[1], 0]);
	const bounds = selectionBounds(design, selection);
	const strips = bounds ? zeroStrips(zero, bounds) : [];
	return (
		<svg className="zero-lines" aria-hidden="true" data-testid="zero-point" data-x={zero[0]} data-y={zero[1]}>
			{strips.map((s) => {
				const a = viewport.project(s.from);
				const b = viewport.project(s.to);
				if (!a || !b) return null;
				return (
					<g key={s.axis} data-testid={`zero-strip-${s.axis}`} data-length={s.length}>
						<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
						<text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">
							{formatLength(Math.abs(s.length), units)}
						</text>
					</g>
				);
			})}
			{ring && <circle cx={ring.x} cy={ring.y} r={7} data-testid="zero-ring" />}
		</svg>
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
