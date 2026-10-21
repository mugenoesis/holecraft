import { Fragment, useEffect, useRef } from 'react';
import { ReportProblem } from './ReportProblem.tsx';
import { SHORTCUT_GROUPS } from './shortcutList.ts';

/** A list of keys as keycaps: "Ctrl Shift Z" is three. */
function Keys({ keys }: { keys: string }) {
	return keys.split(' ').map((k, i) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: the same key can appear twice in one row, and the list never changes
		<kbd key={i}>{k}</kbd>
	));
}

/** Tab goes round the buttons and links in the sheet and never out of it. */
function keepTabInside(e: KeyboardEvent, sheet: HTMLElement | null) {
	e.preventDefault();
	const items = Array.from(sheet?.querySelectorAll<HTMLElement>('a[href], button, textarea') ?? []);
	if (items.length === 0) return;
	const at = items.indexOf(document.activeElement as HTMLElement);
	const next = (at + (e.shiftKey ? -1 : 1) + items.length) % items.length;
	items[next]?.focus();
}

/** Every keyboard shortcut and mouse move in the editor, over the view. Escape, Close or a click outside it shuts it. */
export function ShortcutSheet({ onClose }: { onClose: () => void }) {
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
			<div className="shortcuts" ref={dialog} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
				<header>
					<h2>Keyboard shortcuts</h2>
					<button type="button" ref={close} onClick={onClose}>
						Close
					</button>
				</header>
				<div className="shortcuts-cols">
					{SHORTCUT_GROUPS.map((g) => (
						<section key={g.title}>
							<h3>{g.title}</h3>
							<dl>
								{g.rows.map((r) => (
									<Fragment key={`${r.keys}|${r.what}`}>
										<dt>
											<Keys keys={r.keys} />
										</dt>
										<dd>{r.what}</dd>
									</Fragment>
								))}
							</dl>
						</section>
					))}
				</div>
				<p className="muted">
					Press <kbd>?</kbd> any time to open this; <kbd>Esc</kbd> closes it.
				</p>
				<ReportProblem />
			</div>
		</div>
	);
}
