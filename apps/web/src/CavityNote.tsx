import type { ClosedCavity } from '@holecraft/geometry';

interface Props {
	cavity: ClosedCavity | null;
	/** A drain hole was just added, so a missing cavity is news worth saying. */
	drained: boolean;
	canDrain: boolean;
	onDrain: () => void;
}

/** In the resin tools: warns that the shape holds a cavity no resin can flow into (it sucks on the film as a layer peels). */
export function CavityNote({ cavity, drained, canDrain, onDrain }: Props) {
	if (!cavity) {
		return drained ? (
			<p className="resin-why resin-why-ok" aria-live="polite" data-testid="resin-cavity-why">
				No closed cavity. The drain hole opens it to the outside.
			</p>
		) : null;
	}
	return (
		<div data-testid="resin-cavity">
			<p className="resin-why" aria-live="polite" data-testid="resin-cavity-why">
				<strong>Closed cavity</strong>: about {Math.round(cavity.areaMm2)} mm², at {cavity.z.toFixed(1)} mm high. Resin can’t flow in, so it
				sucks on the film as each layer peels (cupping).
			</p>
			<div className="resin-buttons">
				<button type="button" disabled={!canDrain} onClick={onDrain}>
					Add drain hole
				</button>
			</div>
		</div>
	);
}
