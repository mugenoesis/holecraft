import type { MeshData } from '@holecraft/core';
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
import { SupportsGroup } from './SupportsGroup.tsx';
import { type Accuracy, MAX_WALL, MIN_WALL, useHollow } from './useHollow.ts';
import type { SupportsUi } from './useSupportsUi.ts';

const TILTS = [15, 30, 45] as const;

interface Props {
	design: Design;
	selection: readonly NodeId[];
	dispatch: Dispatch<EditorAction>;
	/** The imported models the design uses, and how to add one just made (the hollow model Trident sends back). */
	meshes: ReadonlyMap<string, MeshData>;
	onMeshAdded: (ref: string, mesh: MeshData) => void;
	/** What the support points' controls share with the view. */
	supportsUi: SupportsUi;
}

const ACCURACIES: readonly { id: Accuracy; label: string }[] = [
	{ id: 'fast', label: 'Fast' },
	{ id: 'normal', label: 'Normal' },
	{ id: 'fine', label: 'Fine' },
];

/** Hollow the selected shape with the Trident slicer: a wall of the given thickness and a cavity inside. */
function HollowGroup({ design, selection, dispatch, meshes, onMeshAdded }: Omit<Props, 'supportsUi'>) {
	const h = useHollow(design, selection, meshes, onMeshAdded, dispatch);
	return (
		<div className="resin-group" role="group" aria-label="Hollow">
			<h3>Hollow</h3>
			<div className="resin-pair">
				<label className="resin-field">
					<span>Wall thickness</span>
					<span className="resin-unit-field">
						<input
							type="number"
							inputMode="decimal"
							min={MIN_WALL}
							max={MAX_WALL}
							step="0.1"
							value={h.wall}
							onChange={(e) => h.setWall(e.target.value)}
						/>
						<span aria-hidden="true">{design.units}</span>
					</span>
				</label>
				<label className="resin-field">
					<span>Accuracy</span>
					<select value={h.accuracy} onChange={(e) => h.setAccuracy(e.target.value as Accuracy)}>
						{ACCURACIES.map((a) => (
							<option key={a.id} value={a.id}>
								{a.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<button type="button" className="resin-wide" disabled={h.why !== null || h.busy} onClick={() => void h.hollow()}>
				{h.busy ? 'Hollowing…' : 'Hollow the selected shape'}
			</button>
			{h.error && (
				<p className="export-problem" role="alert">
					{h.error}
				</p>
			)}
			<p className="muted hint">
				{h.note ??
					h.why ??
					'Trident works out the cavity. The shape becomes a hollow mesh; Undo brings the original back. A hollow print needs drain holes: add them with a hole shape once it is hollow.'}
			</p>
		</div>
	);
}

/** Tools for resin printing: holes for the resin to drain through, and tilting a model so it peels from the film gently. */
export function ResinPanel({ design, selection, dispatch, meshes, onMeshAdded, supportsUi }: Props) {
	const [diameter, setDiameter] = useState(String(DEFAULT_DRAIN_DIAMETER));
	const value = Number(diameter);
	const validDiameter = diameter.trim() !== '' && value >= MIN_DRAIN_DIAMETER && value <= MAX_DRAIN_DIAMETER;
	const canHole = canAddResinHole(design, selection) && validDiameter;
	const tilt = canTilt(design, selection);

	return (
		<section aria-label="Resin">
			<h2>Resin</h2>
			<HollowGroup design={design} selection={selection} dispatch={dispatch} meshes={meshes} onMeshAdded={onMeshAdded} />
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
			<SupportsGroup design={design} meshes={meshes} dispatch={dispatch} ui={supportsUi} />
		</section>
	);
}
