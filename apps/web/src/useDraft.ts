import { type FocusEvent, type KeyboardEvent, useEffect, useState } from 'react';

/**
 * A text box that edits a local draft and applies it on Enter or blur. Whatever the document
 * decides (accepted, rejected, normalised), the box then shows the document's value.
 */
export function useDraft(value: string, onCommit: (draft: string) => void) {
	const [draft, setDraft] = useState(value);
	// After a commit the box must show whatever the document decided, whether it accepted the
	// edit (value changed), rejected it (value unchanged) or normalised it. Bumping `settled`
	// makes the effect below re-read the value *after* the dispatch has rendered. Resetting the
	// draft straight away would flash the old value, and a blur landing in that gap would
	// commit it and silently undo the edit.
	const [settled, setSettled] = useState(0);
	useEffect(() => setDraft(value), [value, settled]);

	// Commit what is actually in the box, not the last rendered draft, so a fast Enter or blur
	// right after typing can never act on a stale value.
	const commit = (typed: string) => {
		if (typed !== value) onCommit(typed);
		setSettled((n) => n + 1);
	};
	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') commit(e.currentTarget.value);
		else if (e.key === 'Escape') setDraft(value);
	};
	return { value: draft, onChange: setDraft, onBlur: (e: FocusEvent<HTMLInputElement>) => commit(e.currentTarget.value), onKeyDown };
}
