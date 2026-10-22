import type { VersionSummary } from '@holecraft/core';
import { useEffect, useRef } from 'react';
import { versionDetail, versionWhen } from './versionHistory.ts';

interface Props {
	/** The kept versions, newest first, or null while they are being fetched. */
	versions: readonly VersionSummary[] | null;
	problem: string | null;
	/** The version being put back, if one is. */
	restoring: string | null;
	now: Date;
	onRestore: (version: string) => void;
	onClose: () => void;
}

/** Tab goes round the buttons in the dialog and never out of it. */
function keepTabInside(e: KeyboardEvent, dialog: HTMLElement | null) {
	e.preventDefault();
	const items = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
	if (items.length === 0) return;
	const at = items.indexOf(document.activeElement as HTMLElement);
	items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
}

/**
 * The earlier versions kept of the design, with a Restore button on each. Restoring is safe: what is there now is kept in this list first, so a
 * restore can itself be undone by restoring the version it replaced. Escape, Close or a click outside shuts it.
 */
export function VersionHistoryDialog({ versions, problem, restoring, now, onRestore, onClose }: Props) {
	const close = useRef<HTMLButtonElement>(null);
	const dialog = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const opener = document.activeElement;
		close.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Tab') return keepTabInside(e, dialog.current);
			if (e.key !== 'Escape') return;
			e.stopImmediatePropagation();
			onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			if (opener instanceof HTMLElement) opener.focus();
		};
	}, [onClose]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape closes it (above); the click is the mouse's way out
		<div
			className="shortcuts-backdrop"
			role="presentation"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="shortcuts history-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="history-title">
				<header>
					<h2 id="history-title">Version history</h2>
					<button type="button" ref={close} onClick={onClose}>
						Close
					</button>
				</header>
				<p className="muted">
					Earlier versions of this design, kept as you work. When you restore one, what you have now is kept in this list first.
				</p>
				{problem && (
					<p className="export-problem" role="alert">
						{problem}
					</p>
				)}
				{versions === null ? (
					<p className="muted">Loading…</p>
				) : versions.length === 0 ? (
					<p className="muted">Nothing kept yet. The first earlier version appears once you have saved a change.</p>
				) : (
					<ul className="history-list">
						{versions.map((v) => {
							const when = versionWhen(v.savedAt, now);
							return (
								<li key={v.version}>
									<span className="history-when">{when}</span>
									<span className="history-detail">{versionDetail(v)}</span>
									<button
										type="button"
										aria-label={`Restore the version from ${when}`}
										disabled={restoring !== null}
										onClick={() => onRestore(v.version)}
									>
										{restoring === v.version ? 'Restoring…' : 'Restore'}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
