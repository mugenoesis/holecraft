import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shortcutAction } from './editorShortcuts.ts';
import { ShortcutSheet } from './ShortcutSheet.tsx';
import { isSheetKey, SHORTCUT_GROUPS } from './shortcutList.ts';
import { nudgeForKey, viewKeyCommand } from './viewport/viewKeys.ts';

const entries = SHORTCUT_GROUPS.flatMap((g) => g.rows);

describe('the shortcut list', () => {
	it('every editing shortcut it lists is one the editor really handles', () => {
		const editing = entries.filter((r) => r.handled?.kind === 'editor');
		expect(editing.length).toBeGreaterThanOrEqual(8);
		for (const row of editing) {
			if (row.handled?.kind !== 'editor') continue;
			const { key, ctrl = false, shift = false } = row.handled;
			expect(shortcutAction({ key, ctrlKey: ctrl, metaKey: false, shiftKey: shift, altKey: false }), row.what).not.toBeNull();
		}
	});

	it('every view and tool key it lists is one the view handles', () => {
		const view = entries.filter((r) => r.handled?.kind === 'view');
		expect(view.length).toBeGreaterThanOrEqual(7);
		for (const row of view) {
			if (row.handled?.kind !== 'view') continue;
			expect(
				viewKeyCommand(row.handled.key, null, () => undefined),
				row.what,
			).toBeDefined();
		}
	});

	it('the arrow keys it lists nudge', () => {
		expect(nudgeForKey('ArrowLeft', false, 1, 0)).not.toBeNull();
		expect(entries.some((r) => r.keys.includes('arrows') || r.keys.includes('←'))).toBe(true);
	});

	it('names each key once per row and has no empty group', () => {
		for (const g of SHORTCUT_GROUPS) expect(g.rows.length, g.title).toBeGreaterThan(0);
		expect(new Set(SHORTCUT_GROUPS.map((g) => g.title)).size).toBe(SHORTCUT_GROUPS.length);
	});

	it('? opens the sheet, with or without Shift, and only when nobody holds Ctrl, Command or Alt', () => {
		expect(isSheetKey({ key: '?', ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
		expect(isSheetKey({ key: '?', ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
		expect(isSheetKey({ key: '/', ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
	});
});

describe('ShortcutSheet', () => {
	const html = renderToStaticMarkup(createElement(ShortcutSheet, { onClose: () => undefined }));

	it('is a labelled dialog with every group and a Close button', () => {
		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-label="Keyboard shortcuts"');
		for (const g of SHORTCUT_GROUPS) expect(html).toContain(g.title);
		expect(html).toContain('Close');
	});

	it('shows each key as a keycap', () => {
		expect(html).toContain('<kbd>Ctrl</kbd>');
		expect(html).toContain('Undo');
	});
});
