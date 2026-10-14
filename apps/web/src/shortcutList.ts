/** How to check that a listed shortcut is really handled: the key press the editor or the view gets. */
type Handled = { kind: 'editor'; key: string; ctrl?: boolean; shift?: boolean } | { kind: 'view'; key: string } | { kind: 'elsewhere' };

interface ShortcutRow {
	/** The keys, separated by spaces; each word is shown as a keycap. */
	keys: string;
	what: string;
	/** Where the key is handled, so a test can keep this list true. Left out for keys that need a tool or a mouse. */
	handled?: Handled;
}

export interface ShortcutGroup {
	title: string;
	rows: readonly ShortcutRow[];
}

const editor = (key: string, ctrl = false, shift = false): Handled => ({ kind: 'editor', key, ctrl, shift });
const view = (key: string): Handled => ({ kind: 'view', key });

/** Every shortcut the editor has, for the sheet that `?` opens. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
	{
		title: 'Edit',
		rows: [
			{ keys: 'Ctrl Z', what: 'Undo', handled: editor('z', true) },
			{ keys: 'Ctrl Shift Z', what: 'Redo', handled: editor('z', true, true) },
			{ keys: 'Ctrl D', what: 'Duplicate', handled: editor('d', true) },
			{ keys: 'Ctrl G', what: 'Group', handled: editor('g', true) },
			{ keys: 'Ctrl Shift G', what: 'Ungroup', handled: editor('g', true, true) },
			{ keys: 'Ctrl A', what: 'Select all', handled: editor('a', true) },
			{ keys: 'Delete', what: 'Delete the selection', handled: editor('Delete') },
			{ keys: 'D', what: 'Drop to the workplane', handled: editor('d') },
			{ keys: 'Esc', what: 'Clear the selection', handled: editor('Escape') },
		],
	},
	{
		title: 'Move',
		rows: [
			{ keys: '← ↑ → ↓', what: 'Nudge one snap step', handled: { kind: 'elsewhere' } },
			{ keys: 'Shift arrows', what: 'Nudge ten steps', handled: { kind: 'elsewhere' } },
		],
	},
	{
		title: 'View',
		rows: [
			{ keys: 'F', what: 'Frame everything', handled: view('f') },
			{ keys: 'Home', what: 'Reset the view', handled: view('Home') },
		],
	},
	{
		title: 'Tools',
		rows: [
			{ keys: 'R', what: 'Ruler', handled: view('r') },
			{ keys: 'W', what: 'Workplane', handled: view('w') },
			{ keys: 'E', what: 'Edges', handled: view('e') },
			{ keys: 'N', what: 'Paint', handled: view('n') },
			{ keys: 'K', what: 'Sketch', handled: view('k') },
		],
	},
	{
		title: 'Paint',
		rows: [
			{ keys: '1 – 9', what: 'Choose a filament' },
			{ keys: 'Shift click', what: 'Erase' },
			{ keys: 'Ctrl wheel', what: 'Brush size' },
		],
	},
	{
		title: 'Sketch',
		rows: [
			{ keys: 'Enter', what: 'Finish the line' },
			{ keys: 'Backspace', what: 'Take the last point back' },
			{ keys: 'Delete', what: 'Delete the selected point or side' },
			{ keys: 'Esc', what: 'Cancel what you are drawing' },
		],
	},
	{
		title: 'Mouse',
		rows: [
			{ keys: 'Right drag', what: 'Orbit the view' },
			{ keys: 'Shift right drag', what: 'Pan the view' },
			{ keys: 'Wheel', what: 'Zoom' },
			{ keys: 'Shift click', what: 'Add to the selection' },
		],
	},
];

/** True for the key that opens the sheet: `?` (which is Shift+/ on most keyboards). */
export function isSheetKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
	return e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey;
}
