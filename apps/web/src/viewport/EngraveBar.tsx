import { FONTS } from '@holecraft/core';

interface Props {
	text: string;
	font: number;
	/** The number fields as typed (they can be half way to a number). */
	em: string;
	depth: string;
	angle: string;
	mode: 'engrave' | 'raised';
	hint: string;
	/** The lettering is being fitted to the surface. */
	busy: boolean;
	onText: (text: string) => void;
	onFont: (font: number) => void;
	onEm: (text: string) => void;
	onDepth: (text: string) => void;
	onAngle: (text: string) => void;
	onMode: (mode: 'engrave' | 'raised') => void;
	onCancel: () => void;
	onFinish: () => void;
}

/** A number box with its unit after it. */
function Amount({
	id,
	label,
	value,
	unit,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	unit: string;
	onChange: (text: string) => void;
}) {
	return (
		<span className="edge-size">
			<label htmlFor={id}>{label}</label>
			<input id={id} type="text" inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
			<span>{unit}</span>
		</span>
	);
}

/** The bar over the view while lettering is placed on a surface: the words, font and size, how deep or how high, the turn, and Cancel and Done. */
export function EngraveBar(p: Props) {
	const lift = p.mode === 'engrave' ? 'Depth' : 'Height';
	return (
		<section className="edge-tool sketch-bar engrave-bar" data-testid="engrave-bar" aria-label="Engrave">
			<div className="edge-tool-row">
				<strong>Lettering</strong>
				<input type="text" aria-label="Words" maxLength={100} value={p.text} onChange={(e) => p.onText(e.target.value)} />
				<select aria-label="Font" value={p.font} onChange={(e) => p.onFont(Number(e.target.value))}>
					{FONTS.map((f) => (
						<option key={f.id} value={f.id}>
							{f.label}
						</option>
					))}
				</select>
				<div className="sketch-tools" role="group" aria-label="Engrave or raise">
					<button type="button" aria-pressed={p.mode === 'engrave'} onClick={() => p.onMode('engrave')}>
						Engrave
					</button>
					<button type="button" aria-pressed={p.mode === 'raised'} onClick={() => p.onMode('raised')}>
						Raised
					</button>
				</div>
			</div>
			<div className="edge-tool-row">
				<Amount id="engrave-size" label="Letter size" value={p.em} unit="mm" onChange={p.onEm} />
				<Amount id="engrave-depth" label={lift} value={p.depth} unit="mm" onChange={p.onDepth} />
				<Amount id="engrave-turn" label="Turn" value={p.angle} unit="°" onChange={p.onAngle} />
			</div>
			<div className="edge-tool-row">
				<span className="muted paint-hint" aria-live="polite">
					{p.hint}
				</span>
			</div>
			<div className="edge-tool-row">
				<span className="edge-tool-spacer" />
				<button type="button" onClick={p.onCancel} disabled={p.busy}>
					Cancel
				</button>
				<button type="button" className="primary" onClick={p.onFinish} disabled={p.busy}>
					{p.busy ? 'Fitting…' : 'Done'}
				</button>
			</div>
		</section>
	);
}
