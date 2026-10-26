import type { ClosedCavity } from '@holecraft/geometry';

interface Props {
	cavities: readonly ClosedCavity[];
	selected: number | null;
	/** Whether the view draws the cavities. */
	show: boolean;
	/** A fill is being made. */
	busy: boolean;
	/** The cavities were just filled, so none being left is news worth saying. */
	filled: boolean;
	/** Why the last fill failed, or null. */
	error: string | null;
	onSelect: (id: number) => void;
	onShow: (show: boolean) => void;
	onFill: (which: readonly ClosedCavity[]) => void;
}

/**
 * In the resin tools: lists the cavities no resin can flow into (each sucks on the film as a layer peels), shows them in the view, and fills
 * the chosen one, or all, with a solid shape.
 */
export function CavityList({ cavities, selected, show, busy, filled, error, onSelect, onShow, onFill }: Props) {
	if (cavities.length === 0) {
		return filled ? (
			<p className="resin-why resin-why-ok" aria-live="polite" data-testid="resin-cavity-why">
				No closed cavities left.
			</p>
		) : null;
	}
	const chosen = cavities.find((c) => c.id === selected);
	return (
		<div className="resin-group" role="group" aria-label="Closed cavities" data-testid="resin-cavity">
			<h3>Closed cavities</h3>
			<p className="resin-why" aria-live="polite" data-testid="resin-cavity-why">
				<strong>
					{cavities.length} closed {cavities.length === 1 ? 'cavity' : 'cavities'}
				</strong>{' '}
				would suck on the film as each layer peels (cupping). Select one to see it, then fill it.
			</p>
			<ul className="cavity-list">
				{cavities.map((c) => (
					<li key={c.id}>
						<button type="button" className="cavity-item" aria-pressed={c.id === selected} onClick={() => onSelect(c.id)}>
							<span>Cavity {c.id + 1}</span>
							<span>
								{Math.round(c.areaMm2)} mm² · from {c.z.toFixed(1)} mm
							</span>
						</button>
					</li>
				))}
			</ul>
			<div className="resin-buttons">
				<button type="button" disabled={!chosen || busy} onClick={() => chosen && onFill([chosen])}>
					Fill selected cavity
				</button>
				<button type="button" disabled={busy} onClick={() => onFill(cavities)}>
					Fill all
				</button>
			</div>
			<label className="muted hint cavity-show">
				<input type="checkbox" checked={show} onChange={(e) => onShow(e.target.checked)} /> Show cavities
			</label>
			{error && (
				<p className="export-problem" role="alert">
					{error}
				</p>
			)}
			<p className="muted hint">Filling adds a solid shape that plugs the cavity, grouped with the model. One undo step.</p>
		</div>
	);
}
