import type { Design } from '@holecraft/core';
import { useEffect, useRef, useState } from 'react';
import { ApiError, saveDesign } from './designsApi.ts';
import { trackLeaving } from './leaving.ts';
import { SaveController, type SaveStatus } from './saveController.ts';

/** Why a failed save is being (or not being) retried, in words for the top bar. */
function problemWords(error: unknown): string {
	if (error instanceof ApiError && error.status === 404) return 'this design no longer exists';
	if (error instanceof ApiError && !error.retryable) return error.message;
	return 'retrying…';
}

export interface AutosaveState {
	status: SaveStatus;
	problem: string | null;
	lastError: string | undefined;
	/** While the design has been changed elsewhere: what to do about it. */
	conflict: { keepMine: () => void; loadOther: () => void } | null;
}

/**
 * Autosaves the design shortly after changes stop, retrying on failure. `initial` is the design as it
 * was loaded (never saved back unchanged). Pending changes are sent when the tab is hidden, and saved
 * when leaving for the designs list.
 */
export function useAutosave(design: Design, initial: Design): AutosaveState {
	const [status, setStatus] = useState<SaveStatus>('saved');
	const [problem, setProblem] = useState<string | null>(null);
	const controller = useRef<SaveController | null>(null);
	/** The modification time of the stored version this one was made from: every save says so, and the server refuses one over a newer version. */
	const base = useRef(initial.updatedAt);
	const [other, setOther] = useState<string | undefined>(undefined);

	useEffect(() => {
		const c = new SaveController(
			async (d) => {
				const saved = await saveDesign(d, { base: base.current });
				base.current = saved.updatedAt;
			},
			(next) => {
				setStatus(next);
				setProblem(next === 'error' ? problemWords(c.lastError) : null);
				const error = c.lastError;
				setOther(next === 'conflict' && error instanceof ApiError ? error.updatedAt : undefined);
			},
			{ shouldRetry: (e) => !(e instanceof ApiError) || e.retryable, isConflict: (e) => e instanceof ApiError && e.conflict },
		);
		controller.current = c;

		// If the tab is closed or hidden with changes still waiting, send them now.
		const onPageHide = () => {
			const pending = c.pendingDesign();
			if (pending) void saveDesign(pending, { keepalive: true, base: base.current }).catch(() => undefined);
		};
		window.addEventListener('pagehide', onPageHide);

		return () => {
			window.removeEventListener('pagehide', onPageHide);
			controller.current = null;
			// Leaving for the list: save whatever is still waiting, then stop.
			trackLeaving(c.flush().finally(() => c.dispose()));
		};
	}, []);

	useEffect(() => {
		if (design !== initial) controller.current?.schedule(design);
	}, [design, initial]);

	const conflict =
		status === 'conflict'
			? {
					/** Keep this version: save it over the other (it is now based on what is stored). */
					keepMine: () => {
						if (other !== undefined) base.current = other;
						controller.current?.resume();
					},
					/** Load the other version: let go of this one and open the design again from the server. */
					loadOther: () => {
						controller.current?.discard();
						window.location.reload();
					},
				}
			: null;
	return { status, problem, lastError: controller.current?.lastError?.message, conflict };
}
