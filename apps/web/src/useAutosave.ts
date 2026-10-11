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

/**
 * Autosaves the design shortly after changes stop, retrying on failure. `initial` is the design as it
 * was loaded (never saved back unchanged). Pending changes are sent when the tab is hidden, and saved
 * when leaving for the designs list.
 */
export function useAutosave(
	design: Design,
	initial: Design,
): { status: SaveStatus; problem: string | null; lastError: string | undefined } {
	const [status, setStatus] = useState<SaveStatus>('saved');
	const [problem, setProblem] = useState<string | null>(null);
	const controller = useRef<SaveController | null>(null);

	useEffect(() => {
		const c = new SaveController(
			(d) => saveDesign(d).then(() => undefined),
			(next) => {
				setStatus(next);
				setProblem(next === 'error' ? problemWords(c.lastError) : null);
			},
			{ shouldRetry: (e) => !(e instanceof ApiError) || e.retryable },
		);
		controller.current = c;

		// If the tab is closed or hidden with changes still waiting, send them now.
		const onPageHide = () => {
			const pending = c.pendingDesign();
			if (pending) void saveDesign(pending, { keepalive: true }).catch(() => undefined);
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

	return { status, problem, lastError: controller.current?.lastError?.message };
}
