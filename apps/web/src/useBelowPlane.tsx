import { useMemo, useSyncExternalStore } from 'react';
import { BelowPlaneDialog } from './BelowPlaneDialog.tsx';
import type { BelowPlaneChoice } from './exportDesign.ts';
import { createQuestion } from './question.ts';

/** The "part of the design is below the workplane" question: `ask` for an export to wait on, and `dialog` to put in the page. */
export function useBelowPlane() {
	const question = useMemo(() => createQuestion<BelowPlaneChoice>(), []);
	const pending = useSyncExternalStore(question.subscribe, question.pending);
	return { ask: question.ask, dialog: pending ? <BelowPlaneDialog onChoose={question.answer} /> : null };
}
