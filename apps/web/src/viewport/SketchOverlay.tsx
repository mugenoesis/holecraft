import type { Selected, SketchOutline, SketchPoint } from '@holecraft/core';

interface Props {
	outlines: readonly SketchOutline[];
	selected: Selected | null;
	/** The rectangle, circle or polygon being dragged out. */
	draftShape: SketchOutline | null;
	/** The line being clicked out. */
	draftLine: { points: SketchPoint[]; hover: SketchPoint | null } | null;
	/** Where a point of the plane is on the screen (pixels in the view). */
	toScreen: (p: SketchPoint) => [number, number];
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** One outline as a closed path through its screen positions. */
function pathOf(outline: SketchOutline, toScreen: Props['toScreen']): string {
	return `${outline.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toScreen(p).map(fmt).join(',')}`).join('')}Z`;
}

/** The sketch drawn over the view, in screen space (an SVG that lets the pointer through): the outlines, handles, and what is being drawn. */
export function SketchOverlay({ outlines, selected, draftShape, draftLine, toScreen }: Props) {
	const chosen = selected ? outlines[selected.outline] : undefined;
	const line = draftLine;
	const last = line?.points[line.points.length - 1];
	return (
		<svg className="sketch-overlay" aria-hidden="true">
			{outlines.length > 0 && <path className="sketch-fill" fillRule="evenodd" d={outlines.map((o) => pathOf(o, toScreen)).join('')} />}
			{draftShape && <path className="sketch-draft" data-testid="sketch-draft" d={pathOf(draftShape, toScreen)} />}
			{chosen?.points.map((p, point) => (
				<rect
					// biome-ignore lint/suspicious/noArrayIndexKey: the points of an outline have no ids, and stay in order
					key={point}
					className={`sketch-handle${selected?.point === point ? ' selected' : ''}`}
					data-testid="sketch-handle"
					data-point={point}
					x={toScreen(p)[0] - 5}
					y={toScreen(p)[1] - 5}
					width={10}
					height={10}
				/>
			))}
			{line && line.points.length > 1 && (
				<polyline className="sketch-line" points={line.points.map((p) => toScreen(p).map(fmt).join(',')).join(' ')} />
			)}
			{line && last && line.hover && (
				<line
					className="sketch-rubber"
					data-testid="sketch-rubber"
					x1={toScreen(last)[0]}
					y1={toScreen(last)[1]}
					x2={toScreen(line.hover)[0]}
					y2={toScreen(line.hover)[1]}
				/>
			)}
			{line?.points.map((p, i) => (
				<circle
					// biome-ignore lint/suspicious/noArrayIndexKey: the points of a line have no ids, and stay in order
					key={i}
					className={`sketch-point${i === 0 && line.points.length >= 3 ? ' closable' : ''}`}
					data-testid="sketch-point"
					cx={toScreen(p)[0]}
					cy={toScreen(p)[1]}
					r={5}
				/>
			))}
		</svg>
	);
}
