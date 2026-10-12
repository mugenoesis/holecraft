import { type AlignEdge, type Axis, canAlign, canFlip, type Design, type NodeId } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** What each edge is called along each axis, for tooltips and screen readers. */
const EDGE_NAMES: Record<Axis, Record<AlignEdge, string>> = {
	x: { min: 'left edges', centre: 'centres', max: 'right edges' },
	y: { min: 'front edges', centre: 'centres', max: 'back edges' },
	z: { min: 'bottoms', centre: 'middles', max: 'tops' },
};
const EDGE_ORDER: readonly AlignEdge[] = ['min', 'centre', 'max'];
const EDGE_GLYPH: Record<AlignEdge, string> = { min: '⇤', centre: '↔', max: '⇥' };

interface Props {
	design: Design;
	selection: readonly NodeId[];
	dispatch: Dispatch<EditorAction>;
}

/** Align the selection along an axis, or mirror it across one. */
export function ArrangePanel({ design, selection, dispatch }: Props) {
	const align = canAlign(design, selection);
	const flip = canFlip(design, selection);
	return (
		<section aria-label="Arrange">
			<h2>Arrange</h2>
			<div className="arrange-grid" role="group" aria-label="Align">
				{AXES.map((axis) => (
					<AlignRow key={axis} axis={axis} enabled={align} dispatch={dispatch} />
				))}
			</div>
			{!align && <p className="muted hint">Select two or more objects to line them up.</p>}
			<div className="arrange-flip" role="group" aria-label="Flip">
				{AXES.map((axis) => (
					<button
						key={axis}
						type="button"
						disabled={!flip}
						onClick={() => dispatch({ type: 'flip', axis })}
						title={`Mirror the selection across ${axis.toUpperCase()}`}
					>
						Flip {axis.toUpperCase()}
					</button>
				))}
			</div>
		</section>
	);
}

function AlignRow({ axis, enabled, dispatch }: { axis: Axis; enabled: boolean; dispatch: Dispatch<EditorAction> }) {
	return (
		<>
			<span className="axis-label">{axis.toUpperCase()}</span>
			{EDGE_ORDER.map((edge) => (
				<button
					key={edge}
					type="button"
					disabled={!enabled}
					aria-label={`Align ${axis.toUpperCase()} ${EDGE_NAMES[axis][edge]}`}
					title={`Line up the ${EDGE_NAMES[axis][edge]} along ${axis.toUpperCase()}`}
					onClick={() => dispatch({ type: 'align', axis, edge })}
				>
					{EDGE_GLYPH[edge]}
				</button>
			))}
		</>
	);
}
