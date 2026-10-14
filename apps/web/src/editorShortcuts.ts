import { type Dispatch, useEffect } from 'react';
import type { EditorAction } from './editorState.ts';
import { isTypingTarget } from './keyboard.ts';
import { isSheetKey } from './shortcutList.ts';

/** The parts of a key press that decide which shortcut it is. */
export interface ShortcutEvent {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}

type Rule = (shift: boolean) => EditorAction;

/** Shortcuts used with Ctrl (or Command), by lower-case key. */
const WITH_MODIFIER = new Map<string, Rule>([
	['z', (shift) => ({ type: shift ? 'redo' : 'undo' })],
	['y', () => ({ type: 'redo' })],
	['d', () => ({ type: 'duplicate' })],
	['g', (shift) => ({ type: shift ? 'ungroup' : 'group' })],
	['a', () => ({ type: 'selectAll' })],
]);

/** Shortcuts used on their own, by lower-case key. */
const PLAIN = new Map<string, Rule>([
	['d', () => ({ type: 'dropToPlane' })],
	['delete', () => ({ type: 'delete' })],
	['backspace', () => ({ type: 'delete' })],
	['escape', () => ({ type: 'clearSelection' })],
]);

/** What a key press means in the editor, or null if it is not a shortcut. Anything with Alt held is left alone. */
export function shortcutAction(e: ShortcutEvent): EditorAction | null {
	if (e.altKey) return null;
	const rules = e.ctrlKey || e.metaKey ? WITH_MODIFIER : PLAIN;
	return rules.get(e.key.toLowerCase())?.(e.shiftKey) ?? null;
}

/** Runs the editor's keyboard shortcuts, except while the user is typing in a field. `?` opens the shortcut sheet. */
export function useEditorShortcuts(dispatch: Dispatch<EditorAction>, onHelp: () => void): void {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (isSheetKey(e)) {
				onHelp();
				e.preventDefault();
				return;
			}
			const action = shortcutAction(e);
			if (!action) return;
			dispatch(action);
			e.preventDefault();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [dispatch, onHelp]);
}
