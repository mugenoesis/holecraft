import {
	type Design,
	formatLength,
	type MeshData,
	measureBetween,
	nextRuler,
	type RulerState,
	type Snap,
	type SnapEdge,
	snapMeasuredPoint,
	snapToEdges,
	type Units,
	type Vec3,
} from '@holecraft/core';
import { useEffect, useRef, useState } from 'react';
import { browserStorage, readRulerSnap, writeRulerSnap } from './rulerSnapSetting.ts';
import { useSnapEdges } from './useSnapEdges.ts';
import { useSurfaceTool } from './useSurfaceTool.ts';
import type { FindEdges } from './useToolEdges.ts';
import type { Viewport } from './Viewport.ts';

interface Props {
	getViewport: () => Viewport | null;
	units: Units;
	/** Grid step in mm that points on the bare workplane snap to; 0 for none. */
	snap: number;
	/** What the corners and edges to snap to are found from. */
	design: Design;
	meshes: ReadonlyMap<string, MeshData>;
	findEdges: FindEdges;
	/** Changes whenever the camera does, so the lines are redrawn where the points now are. */
	camera: unknown;
	onClose: () => void;
}

/** Where the pointer is on screen, in pixels within the view. */
interface ViewPoint {
	x: number;
	y: number;
}

/** A measured point: where it is, and what it caught on if it snapped to a corner or an edge. */
interface Placed {
	point: Vec3;
	caught: Snap | null;
}

/**
 * The ruler: while it is on, clicks on a shape's face or on the workplane drop the start and then the end
 * of a measurement (a third click starts over), and the readout shows the distance and the offset on each
 * axis. Within a few pixels of a sharp corner, an edge's middle or an edge the point jumps onto it exactly (a marker shows
 * which), unless Snap is switched off. It only looks at the design; nothing is saved or changed. Escape clears it, then switches it off.
 */
export function RulerOverlay({ getViewport, units, snap, design, meshes, findEdges, camera: _camera, onClose }: Props) {
	const [ruler, setRuler] = useState<RulerState>({ a: null, b: null });
	const [hover, setHover] = useState<Placed | null>(null);
	const rulerRef = useRef(ruler);
	rulerRef.current = ruler;
	const [snapOn, setSnapOn] = useState(() => readRulerSnap(browserStorage()));
	const edges = useSnapEdges(findEdges, design, meshes, snapOn);
	const edgesRef = useRef<SnapEdge[]>(edges);
	edgesRef.current = edges;
	const snapRef = useRef(snapOn);
	snapRef.current = snapOn;

	/** The measured point for a pointer at `at`: caught on a corner or edge near it, else on the surface under it (on the grid if bare floor). */
	const placeAt = (at: ViewPoint): Placed | null => {
		const viewport = getViewport();
		if (!viewport) return null;
		const rect = viewport.element.getBoundingClientRect();
		const hit = viewport.pickSurface(rect.left + at.x, rect.top + at.y);
		if (!hit) return null;
		const caught = snapRef.current ? snapToEdges(edgesRef.current, (p) => viewport.project(p), hit.point, at) : null;
		return { point: caught ? caught.point : snapMeasuredPoint(hit.point, hit.normal, snap), caught };
	};

	// where the pointer last was, so the marker can be worked out again when the edges (or the Snap switch) change under a still pointer
	const pointer = useRef<ViewPoint | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `edges` and `snapOn` arriving or changing is the reason to look again; placeAt reads them through refs
	useEffect(() => {
		setHover(pointer.current ? placeAt(pointer.current) : null);
	}, [edges, snapOn]);

	useSurfaceTool(getViewport, {
		onHoverAt: (at) => {
			pointer.current = at;
			setHover(at ? placeAt(at) : null);
		},
		onClickAt: (at) => {
			const placed = placeAt(at);
			if (placed) setRuler(nextRuler(rulerRef.current, placed.point));
		},
		onEscape: () => (rulerRef.current.a ? setRuler({ a: null, b: null }) : onClose()),
	});

	const viewport = getViewport();
	const end = ruler.b ?? hover?.point ?? null;
	const a = ruler.a ? viewport?.project(ruler.a) : null;
	const b = ruler.a && end ? viewport?.project(end) : null;
	const measurement = ruler.a && end ? measureBetween(ruler.a, end) : null;
	const marked = hover?.caught && !ruler.b ? { at: viewport?.project(hover.caught.point), kind: hover.caught.kind } : null;

	return (
		<>
			<svg className="ruler-lines" aria-hidden="true">
				{a && b && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={ruler.b ? 'done' : 'live'} />}
				{a && <circle cx={a.x} cy={a.y} r={5} />}
				{b && ruler.b && <circle cx={b.x} cy={b.y} r={5} />}
				{marked?.at && <SnapMarker x={marked.at.x} y={marked.at.y} kind={marked.kind} />}
			</svg>
			<Readout
				measurement={measurement}
				started={!!ruler.a}
				units={units}
				snapOn={snapOn}
				onSnap={(on) => {
					setSnapOn(on);
					writeRulerSnap(browserStorage(), on);
					setHover(null);
				}}
			/>
		</>
	);
}

/** What the ruler is caught on: a square for a corner, a triangle for the middle of an edge, a ring for a point along an edge. */
export function SnapMarker({ x, y, kind }: { x: number; y: number; kind: Snap['kind'] }) {
	const props = { className: 'ruler-snap', 'data-testid': 'ruler-snap', 'data-kind': kind } as const;
	if (kind === 'corner') return <rect {...props} x={x - 6} y={y - 6} width={12} height={12} />;
	if (kind === 'middle') return <polygon {...props} points={`${x},${y - 7} ${x + 7},${y + 6} ${x - 7},${y + 6}`} />;
	return <circle {...props} cx={x} cy={y} r={6} />;
}

/** The distance and its offsets (or what to click next), and the Snap switch. */
export function Readout(props: {
	measurement: ReturnType<typeof measureBetween> | null;
	started: boolean;
	units: Units;
	snapOn: boolean;
	onSnap: (on: boolean) => void;
}) {
	const { measurement, units } = props;
	return (
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
				<span>{props.started ? 'Click where to measure to' : 'Click a face or the workplane to start measuring'}</span>
			)}
			<label className="ruler-snap-toggle" title="Catch the ruler on sharp corners, the middles of edges and the edges themselves">
				<input type="checkbox" checked={props.snapOn} onChange={(e) => props.onSnap(e.target.checked)} /> Snap to corners and edges
			</label>
		</div>
	);
}
