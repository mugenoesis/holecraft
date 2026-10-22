import type { VersionSummary } from '@holecraft/core';
import { useCallback, useState } from 'react';
import { ApiError, listVersions, restoreVersion } from './designsApi.ts';

const words = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong');

export interface VersionHistoryUi {
	open: boolean;
	/** The kept versions, newest first; null while they are being fetched. */
	versions: readonly VersionSummary[] | null;
	problem: string | null;
	/** The version being put back, if one is. */
	restoring: string | null;
	show: () => void;
	hide: () => void;
	restore: (version: string) => void;
}

/**
 * The version history dialog's state. Showing it first saves whatever is still waiting (so the newest edits are in the design that restoring
 * keeps), then lists the versions. Restoring asks the server, then lets go of anything unsaved and opens the design again from the server.
 */
export function useVersionHistory(designId: string, save: { flush: () => Promise<void>; reloadFresh: () => void }): VersionHistoryUi {
	const [open, setOpen] = useState(false);
	const [versions, setVersions] = useState<readonly VersionSummary[] | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [restoring, setRestoring] = useState<string | null>(null);
	const { flush, reloadFresh } = save;

	const show = useCallback(() => {
		setOpen(true);
		setVersions(null);
		setProblem(null);
		void (async () => {
			await flush();
			try {
				setVersions(await listVersions(designId));
			} catch (error) {
				setProblem(words(error));
				setVersions([]);
			}
		})();
	}, [designId, flush]);

	const restore = useCallback(
		(version: string) => {
			setRestoring(version);
			setProblem(null);
			restoreVersion(designId, version).then(reloadFresh, (error: unknown) => {
				setProblem(words(error));
				setRestoring(null);
			});
		},
		[designId, reloadFresh],
	);

	const hide = useCallback(() => setOpen(false), []);
	return { open, versions, problem, restoring, show, hide, restore };
}
