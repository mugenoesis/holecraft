import { useEffect, useRef, useState } from 'react';
import { fetchHealth } from './api.ts';
import { diagnosticsText, reportUrl, type SystemInfo, systemInfo } from './bugReport.ts';
import { type LoggedError, recentErrors } from './errorLog.ts';

/** `done`: the text is on the clipboard. `by-hand`: the clipboard is not available (a page over plain http), so the text is shown. */
export type Copied = 'done' | 'by-hand' | null;

interface ViewProps {
	info: SystemInfo;
	errors: readonly LoggedError[];
	onCopy: () => void;
	copied: Copied;
}

/** The markup: a link that opens a new GitHub issue, and a button that copies what to paste into it. */
export function ReportProblemView({ info, errors, onCopy, copied }: ViewProps) {
	const text = diagnosticsText(info, errors);
	const box = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (copied === 'by-hand') box.current?.select();
	}, [copied]);
	return (
		<div className="report-problem">
			<a href={reportUrl(info)} target="_blank" rel="noopener noreferrer" className="report-link">
				Report a problem
			</a>
			<button type="button" onClick={onCopy}>
				Copy diagnostics
			</button>
			{copied === 'done' && <span aria-live="polite">Copied</span>}
			{copied === 'by-hand' && <textarea ref={box} readOnly rows={8} aria-label="Diagnostics to copy" value={text} />}
			<p className="muted">
				Opens a new issue on GitHub in your browser; nothing is sent from here. The diagnostics are the version, browser and latest errors:
				no design data.
			</p>
		</div>
	);
}

/** Report a problem, with the server's version looked up. */
export function ReportProblem() {
	const [version, setVersion] = useState('unknown');
	const [copied, setCopied] = useState<Copied>(null);
	useEffect(() => {
		const ctrl = new AbortController();
		fetchHealth(ctrl.signal).then(
			(h) => setVersion(h.version),
			() => {},
		);
		return () => ctrl.abort();
	}, []);

	const info = systemInfo(version);
	const copy = async () => {
		const text = diagnosticsText(info, recentErrors());
		try {
			await navigator.clipboard.writeText(text);
			setCopied('done');
		} catch {
			setCopied('by-hand');
		}
	};
	return <ReportProblemView info={info} errors={recentErrors()} onCopy={() => void copy()} copied={copied} />;
}
