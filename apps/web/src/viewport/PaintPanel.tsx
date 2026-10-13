import { type BrushShape, MAX_FILL_ANGLE } from '@holecraft/core';
import { BRUSH_SIZE, type PaintSettings } from './paintTool.ts';

interface Props {
	palette: readonly string[];
	/** The chosen filament, 0-based. */
	filament: number;
	tool: PaintSettings['tool'];
	angle: number;
	/** The brush's shape and size (its diameter, mm). */
	shape: BrushShape;
	size: number;
	/** A problem with the last click, shown in place of the hint. */
	status: string | null;
	/** Whether anything selected has paint to erase. */
	canErase: boolean;
	onFilament: (index: number) => void;
	onTool: (tool: PaintSettings['tool']) => void;
	onAngle: (degrees: number) => void;
	onShape: (shape: BrushShape) => void;
	onSize: (mm: number) => void;
	onEraseAll: () => void;
	onDone: () => void;
}

const SHAPES: readonly (readonly [BrushShape, string])[] = [
	['circle', 'Circle'],
	['sphere', 'Sphere'],
	['triangle', 'Triangles'],
];

const hintFor = (tool: PaintSettings['tool']) =>
	tool === 'brush'
		? 'Drag to paint · Shift to erase · Ctrl+wheel changes the brush size'
		: 'Click a face to paint it · Shift+click to erase · Ctrl+wheel changes the angle';

/**
 * The bar at the bottom of the view while the Paint tool is on, laid out like OrcaSlicer's colour painting: the filaments (numbered, and
 * on the number keys), the tool, the smart fill angle, then Erase all and Done. Painting itself is a click in the view (Shift erases).
 */
export function PaintPanel(p: Props) {
	return (
		<section className="edge-tool paint-tool" data-testid="paint-tool" aria-label="Paint">
			<div className="edge-tool-row">
				<strong>Filaments</strong>
				<div className="paint-swatches" role="group" aria-label="Filaments">
					{p.palette.map((hex, index) => (
						<button
							key={hex}
							type="button"
							className="palette-tile"
							style={{ background: hex }}
							aria-label={`Filament ${index + 1}: ${hex}`}
							aria-pressed={index === p.filament}
							title={`Filament ${index + 1}${index < 9 ? ` (key ${index + 1})` : ''}`}
							onClick={() => p.onFilament(index)}
						>
							{index + 1}
						</button>
					))}
				</div>
			</div>
			<div className="edge-tool-row">
				<strong>Tool</strong>
				<fieldset className="edge-kind" aria-label="Tool">
					<label>
						<input type="radio" name="paint-tool" aria-label="Smart fill" checked={p.tool === 'smart'} onChange={() => p.onTool('smart')} />
						Smart fill
					</label>
					<label>
						<input
							type="radio"
							name="paint-tool"
							aria-label="Bucket fill"
							checked={p.tool === 'bucket'}
							onChange={() => p.onTool('bucket')}
						/>
						Bucket fill
					</label>
					<label>
						<input type="radio" name="paint-tool" aria-label="Brush" checked={p.tool === 'brush'} onChange={() => p.onTool('brush')} />
						Brush
					</label>
				</fieldset>
			</div>
			{p.tool === 'brush' && (
				<>
					<div className="edge-tool-row">
						<strong>Brush shape</strong>
						<fieldset className="edge-kind" aria-label="Brush shape">
							{SHAPES.map(([shape, label]) => (
								<label key={shape}>
									<input type="radio" name="paint-shape" aria-label={label} checked={p.shape === shape} onChange={() => p.onShape(shape)} />
									{label}
								</label>
							))}
						</fieldset>
					</div>
					<div className="edge-tool-row">
						<span className="edge-size">
							<label htmlFor="paint-size">Brush size</label>
							<input
								id="paint-size"
								type="range"
								aria-label="Brush size"
								min={BRUSH_SIZE.min}
								max={BRUSH_SIZE.max}
								step={BRUSH_SIZE.step}
								value={p.size}
								disabled={p.shape === 'triangle'}
								onChange={(e) => p.onSize(Number(e.target.value))}
							/>
							<output>{p.size} mm</output>
						</span>
					</div>
				</>
			)}
			<div className="edge-tool-row">
				<span className="edge-size">
					<label htmlFor="paint-angle">Smart fill angle</label>
					<input
						id="paint-angle"
						type="range"
						aria-label="Smart fill angle"
						min={0}
						max={MAX_FILL_ANGLE}
						step={1}
						value={p.angle}
						disabled={p.tool !== 'smart'}
						onChange={(e) => p.onAngle(Number(e.target.value))}
					/>
					<output>{p.angle}°</output>
				</span>
			</div>
			<div className="edge-tool-row">
				<span className="muted paint-hint" aria-live="polite">
					{p.status ?? hintFor(p.tool)}
				</span>
				<span className="edge-tool-spacer" />
				<button type="button" onClick={p.onEraseAll} disabled={!p.canErase} title="Take all the paint off the selected shapes">
					Erase all
				</button>
				<button type="button" className="primary" onClick={p.onDone}>
					Done
				</button>
			</div>
		</section>
	);
}
