import { MAX_SIDES, MIN_SIDES, type SketchTool } from '@holecraft/core';

interface Props {
	tool: SketchTool;
	sides: number;
	/** Grid size in mm, 0 for off. */
	snap: number;
	/** The extrude height as typed (it can be half way to a number). */
	height: string;
	hint: string;
	canFinish: boolean;
	canDelete: boolean;
	/** An outline is selected, so its sides can be made straight or smooth. */
	canReshape: boolean;
	/** An existing sketch is being redrawn, not a new one drawn. */
	editing: boolean;
	onTool: (tool: SketchTool) => void;
	onSides: (sides: number) => void;
	onSnap: (on: boolean) => void;
	onHeight: (text: string) => void;
	onDelete: () => void;
	onStraighten: () => void;
	onSmooth: () => void;
	onCancel: () => void;
	onFinish: () => void;
}

const TOOLS: readonly (readonly [SketchTool, string])[] = [
	['select', 'Select'],
	['rectangle', 'Rectangle'],
	['circle', 'Circle'],
	['polygon', 'Polygon'],
	['line', 'Line'],
	['arc', 'Arc'],
	['spline', 'Spline'],
];

/** The bar at the bottom of the view while drawing a sketch: the tools, their options, the snap and the thickness, and Cancel and Finish. */
export function SketchBar(p: Props) {
	return (
		<section className="edge-tool sketch-bar" data-testid="sketch-bar" aria-label="Sketch">
			<div className="edge-tool-row">
				<strong>Draw</strong>
				<div className="sketch-tools" role="group" aria-label="Sketch tool">
					{TOOLS.map(([tool, label]) => (
						<button key={tool} type="button" aria-pressed={p.tool === tool} onClick={() => p.onTool(tool)}>
							{label}
						</button>
					))}
				</div>
				<span className="edge-size">
					<label htmlFor="sketch-sides">Sides</label>
					<input
						id="sketch-sides"
						type="number"
						aria-label="Sides"
						min={MIN_SIDES}
						max={MAX_SIDES}
						step={1}
						value={p.sides}
						disabled={p.tool !== 'polygon'}
						onChange={(e) => p.onSides(Number(e.target.value))}
					/>
				</span>
			</div>
			<div className="edge-tool-row">
				<label className="edge-size">
					<input type="checkbox" checked={p.snap > 0} onChange={(e) => p.onSnap(e.target.checked)} />
					{p.snap > 0 ? `Snap to grid (${p.snap} mm)` : 'Snap to grid'}
				</label>
				<span className="edge-size">
					<label htmlFor="sketch-height">{p.editing ? 'Height' : 'Extrude height'}</label>
					<input
						id="sketch-height"
						type="text"
						inputMode="decimal"
						aria-label="Extrude height"
						value={p.height}
						onChange={(e) => p.onHeight(e.target.value)}
					/>
					<span>mm</span>
				</span>
				{p.canReshape && (
					<>
						<button type="button" onClick={p.onStraighten} title="Make every side of the selected outline straight">
							Straighten sides
						</button>
						<button type="button" onClick={p.onSmooth} title="Make the selected outline one smooth curve through its corners">
							Smooth corners
						</button>
					</>
				)}
			</div>
			<div className="edge-tool-row">
				<span className="muted paint-hint" aria-live="polite">
					{p.hint}
				</span>
			</div>
			<div className="edge-tool-row">
				<button type="button" onClick={p.onDelete} disabled={!p.canDelete}>
					Delete selected
				</button>
				<span className="edge-tool-spacer" />
				<button type="button" onClick={p.onCancel}>
					Cancel
				</button>
				<button type="button" className="primary" onClick={p.onFinish} disabled={!p.canFinish}>
					Finish
				</button>
			</div>
		</section>
	);
}
