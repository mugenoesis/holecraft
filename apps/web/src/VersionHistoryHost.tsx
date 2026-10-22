import { useState } from 'react';
import type { VersionHistoryUi } from './useVersionHistory.ts';
import { VersionHistoryDialog } from './VersionHistoryDialog.tsx';

/** The version history dialog while it is open, and nothing otherwise (so the editor has no branch of its own for it). */
export function VersionHistoryHost({ history }: { history: VersionHistoryUi }) {
	// the time the list is read against is taken when it opens, so "Today" does not change under the reader's eyes
	const [now] = useState(() => new Date());
	return history.open ? (
		<VersionHistoryDialog
			versions={history.versions}
			problem={history.problem}
			restoring={history.restoring}
			now={now}
			onRestore={history.restore}
			onClose={history.hide}
		/>
	) : null;
}
