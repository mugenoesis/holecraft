import { outlineHandles, outlinePolygon, type Selected, type SketchOutline, type SketchPoint } from '@holecraft/core';

type ToScreen = (p: SketchPoint) => [number, number];

interface Props {
	outlines: readonly SketchOutline[];
	selected: Selected | null;
	/** The rectangle, circle or polygon being dragged out. */
	draftShape: SketchOutline | null;
	/** The line being clicked out. */
	draftLine?: { points: SketchPoint[]; hover: SketchPoint | null } | null;
	/** The path of arcs being clicked out: the corners, the arcs so far, the next arc as it would be, and the point it goes through. */
	draftArc?: { points: SketchPoint[]; through: SketchPoint | null; placed: SketchPoint[]; preview: SketchPoint[] | null } | null;
	/** The smooth curve being clicked out: its corners and the curve through them. */
	draftSpline?: { points: SketchPoint[]; curve: SketchPoint[] } | null;
	/** Where a point of the plane is on the screen (pixels in the view). */
	toScreen: ToScreen;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const screenPoints = (points: readonly SketchPoint[], toScreen: ToScreen) => points.map((p) => toScreen(p).map(fmt).join(',')).join(' ');

/** One outline as a closed path through its screen positions (its curves cut into short pieces). */
function pathOf(outline: SketchOutline, toScreen: ToScreen): string {
	return `${outlinePolygon(outline)
		.map((p, i) => `${i === 0 ? 'M' : 'L'}${toScreen(p).map(fmt).join(',')}`)
		.join('')}Z`;
}

/** A diamond centred on a screen point: the handle in the middle of a side. */
const diamond = ([x, y]: [number, number]) => `M${fmt(x)},${fmt(y - 6)} l6,6 l-6,6 l-6,-6 z`;

/** The corner and side handles of the selected outline. */
function Handles({ outline, selected, toScreen }: { outline: SketchOutline; selected: Selected; toScreen: ToScreen }) {
	const { points, mids } = outlineHandles(outline);
	return (
		<>
			{mids.map((mid, segment) => (
				<path
					// biome-ignore lint/suspicious/noArrayIndexKey: the sides of an outline have no ids, and stay in order
					key={segment}
					className={`sketch-mid${selected.segment === segment ? ' selected' : ''}`}
					data-testid="sketch-mid"
					data-segment={segment}
					d={diamond(toScreen(mid))}
				/>
			))}
			{points.map((p, point) => (
				<rect
					// biome-ignore lint/suspicious/noArrayIndexKey: the points of an outline have no ids, and stay in order
					key={point}
					className={`sketch-handle${selected.point === point ? ' selected' : ''}`}
					data-testid="sketch-handle"
					data-point={point}
					x={toScreen(p)[0] - 5}
					y={toScreen(p)[1] - 5}
					width={10}
					height={10}
				/>
			))}
		</>
	);
}

/** The corners placed so far of a line, arc path or spline: the first one is where it can be closed once there are enough. */
function Dots({ points, closeAfter, toScreen }: { points: readonly SketchPoint[]; closeAfter: number; toScreen: ToScreen }) {
	return points.map((p, i) => (
		<circle
			// biome-ignore lint/suspicious/noArrayIndexKey: the points of a line have no ids, and stay in order
			key={i}
			className={`sketch-point${i === 0 && points.length >= closeAfter ? ' closable' : ''}`}
			data-testid="sketch-point"
			cx={toScreen(p)[0]}
			cy={toScreen(p)[1]}
			r={5}
		/>
	));
}

function LineDraft({ line, toScreen }: { line: NonNullable<Props['draftLine']>; toScreen: ToScreen }) {
	const last = line.points[line.points.length - 1];
	return (
		<>
			{line.points.length > 1 && <polyline className="sketch-line" points={screenPoints(line.points, toScreen)} />}
			{last && line.hover && (
				<line
					className="sketch-rubber"
					data-testid="sketch-rubber"
					x1={toScreen(last)[0]}
					y1={toScreen(last)[1]}
					x2={toScreen(line.hover)[0]}
					y2={toScreen(line.hover)[1]}
				/>
			)}
			<Dots points={line.points} closeAfter={3} toScreen={toScreen} />
		</>
	);
}

function ArcDraft({ arc, toScreen }: { arc: NonNullable<Props['draftArc']>; toScreen: ToScreen }) {
	return (
		<>
			{arc.placed.length > 1 && <polyline className="sketch-line" points={screenPoints(arc.placed, toScreen)} />}
			{arc.preview && arc.preview.length > 1 && (
				<polyline className="sketch-rubber" data-testid="sketch-arc-preview" fill="none" points={screenPoints(arc.preview, toScreen)} />
			)}
			{arc.through && (
				<circle className="sketch-through" data-testid="sketch-through" cx={toScreen(arc.through)[0]} cy={toScreen(arc.through)[1]} r={4} />
			)}
			<Dots points={arc.points} closeAfter={2} toScreen={toScreen} />
		</>
	);
}

/** The sketch drawn over the view, in screen space (an SVG that lets the pointer through): the outlines, handles, and what is being drawn. */
export function SketchOverlay({ outlines, selected, draftShape, draftLine, draftArc, draftSpline, toScreen }: Props) {
	const chosen = selected ? outlines[selected.outline] : undefined;
	return (
		<svg className="sketch-overlay" aria-hidden="true">
			{outlines.length > 0 && <path className="sketch-fill" fillRule="evenodd" d={outlines.map((o) => pathOf(o, toScreen)).join('')} />}
			{draftShape && <path className="sketch-draft" data-testid="sketch-draft" d={pathOf(draftShape, toScreen)} />}
			{chosen && selected && <Handles outline={chosen} selected={selected} toScreen={toScreen} />}
			{draftLine && <LineDraft line={draftLine} toScreen={toScreen} />}
			{draftArc && <ArcDraft arc={draftArc} toScreen={toScreen} />}
			{draftSpline && (
				<>
					{draftSpline.curve.length > 1 && <polyline className="sketch-line" points={screenPoints(draftSpline.curve, toScreen)} />}
					<Dots points={draftSpline.points} closeAfter={3} toScreen={toScreen} />
				</>
			)}
		</svg>
	);
}
