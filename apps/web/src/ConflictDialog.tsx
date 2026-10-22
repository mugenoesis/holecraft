import { useEffect, useRef } from 'react';

/**
 * Shown when a save finds the design was saved from somewhere else (another tab, window or device) since this one was opened. Saving has stopped,
 * so nothing is lost yet; a choice has to be made, and each choice says what it costs. Focus starts on the box itself, so Enter chooses neither.
 */
export function ConflictDialog({ onKeepMine, onLoadOther }: { onKeepMine: () => void; onLoadOther: () => void }) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => box.current?.focus(), []);
	return (
		<div className="shortcuts-backdrop" role="presentation">
			<div
				className="shortcuts ask-dialog"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="conflict-title"
				aria-describedby="conflict-text"
				tabIndex={-1}
				ref={box}
			>
				<h2 id="conflict-title">This design was changed somewhere else</h2>
				<p id="conflict-text">
					It was saved from another tab, window or device after you opened it. <strong>Keep my version</strong> saves what you see here, and
					it replaces the other version. <strong>Load the other version</strong> shows what was saved there, and you lose your unsaved
					changes.
				</p>
				<div className="button-row">
					<button type="button" onClick={onKeepMine}>
						Keep my version
					</button>
					<button type="button" onClick={onLoadOther}>
						Load the other version
					</button>
				</div>
			</div>
		</div>
	);
}

/** The dialog while the design has been changed elsewhere, and nothing otherwise (so the editor has no branch of its own for it). */
export function ConflictHost({ conflict }: { conflict: { keepMine: () => void; loadOther: () => void } | null }) {
	return conflict ? <ConflictDialog onKeepMine={conflict.keepMine} onLoadOther={conflict.loadOther} /> : null;
}
