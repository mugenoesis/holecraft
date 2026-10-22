import { useEffect, useRef } from 'react';
import type { BelowPlaneChoice } from './exportDesign.ts';

/**
 * Asked when something being exported goes through the workplane: a slicer will not print underground, so the part below may be cut off here,
 * or left for the slicer to deal with (it usually lifts the model onto the bed). Escape cancels; focus starts on the safe choice.
 */
export function BelowPlaneDialog({ onChoose }: { onChoose: (choice: BelowPlaneChoice) => void }) {
	const first = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		first.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopImmediatePropagation();
			onChoose('cancel');
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onChoose]);

	return (
		<div className="shortcuts-backdrop" role="presentation">
			<div className="shortcuts ask-dialog" role="dialog" aria-modal="true" aria-label="Part of the design is below the workplane">
				<h2>Part of the design is below the workplane</h2>
				<p>
					A printer cannot print underground. <strong>Cut off</strong> removes everything under the workplane from the file, leaving a flat
					bottom. <strong>Export as it is</strong> keeps the whole shape, in its current position, and leaves it to your slicer to lift it
					onto the bed.
				</p>
				<div className="button-row">
					<button type="button" ref={first} className="primary" onClick={() => onChoose('keep')}>
						Export as it is
					</button>
					<button type="button" onClick={() => onChoose('cut')}>
						Cut off at the workplane
					</button>
					<button type="button" onClick={() => onChoose('cancel')}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
