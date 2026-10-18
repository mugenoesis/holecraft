import {
	canAddResinHole,
	canTilt,
	DEFAULT_DRAIN_DIAMETER,
	type Design,
	MAX_DRAIN_DIAMETER,
	MIN_DRAIN_DIAMETER,
	type NodeId,
} from '@holecraft/core';
import { type Dispatch, useState } from 'react';
import type { EditorAction } from './editorState.ts';

const TILTS = [15, 30, 45] as const;

interface Props {
	design: Design;
	selection: readonly NodeId[];
	dispatch: Dispatch<EditorAction>;
}

/** Tools for resin printing: holes for the resin to drain through, and tilting a model so it peels from the film gently. */
export function ResinPanel({ design, selection, dispatch }: Props) {
	const [diameter, setDiameter] = useState(String(DEFAULT_DRAIN_DIAMETER));
	const value = Number(diameter);
	const validDiameter = diameter.trim() !== '' && value >= MIN_DRAIN_DIAMETER && value <= MAX_DRAIN_DIAMETER;
	const canHole = canAddResinHole(design, selection) && validDiameter;
	const tilt = canTilt(design, selection);

	return (
		<section aria-label="Resin">
			<h2>Resin</h2>
			<div className="resin-group" role="group" aria-label="Drain holes">
				<h3>Drain holes</h3>
				<label className="resin-field">
					<span>Diameter</span>
					<span className="resin-unit-field">
						<input
							type="number"
							inputMode="decimal"
							min={MIN_DRAIN_DIAMETER}
							max={MAX_DRAIN_DIAMETER}
							step="0.1"
							value={diameter}
							aria-invalid={!validDiameter}
							onChange={(e) => setDiameter(e.target.value)}
						/>
						<span aria-hidden="true">{design.units}</span>
					</span>
				</label>
				<div className="resin-buttons">
					<button
						type="button"
						disabled={!canHole}
						onClick={() => dispatch({ type: 'resinHole', kind: 'drain', diameter: value })}
						title="A hole in the bottom, grouped with the shape so it cuts"
					>
						Add drain hole
					</button>
					<button
						type="button"
						disabled={!canHole}
						onClick={() => dispatch({ type: 'resinHole', kind: 'vent', diameter: value })}
						title="A hole in the top, so air can get in as the resin drains"
					>
						Add vent hole
					</button>
				</div>
				<p className="muted hint">
					{canAddResinHole(design, selection)
						? 'Ordinary holes: a drain at the bottom, a vent at the top, grouped with the shape so they cut. Move, resize or delete them like any shape. They only help a hollow model.'
						: 'Select one shape or group to add a drain or vent hole to it.'}
				</p>
			</div>
			<div className="resin-group" role="group" aria-label="Orientation">
				<h3>Orientation</h3>
				<div className="resin-buttons">
					{TILTS.map((degrees) => (
						<button
							key={degrees}
							type="button"
							disabled={!tilt}
							onClick={() => dispatch({ type: 'tilt', degrees })}
							title={`Turn the selection ${degrees} degrees about the X axis and set it back on the plane`}
						>
							Tilt {degrees}°
						</button>
					))}
				</div>
				<p className="muted hint">
					{tilt
						? 'A tilted model peels from the film a thin line at a time. Each press turns the selection further about the X axis.'
						: 'Select one shape or group to tilt it.'}
				</p>
			</div>
		</section>
	);
}
