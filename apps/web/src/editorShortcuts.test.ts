import { describe, expect, it } from 'vitest';
import { type ShortcutEvent, shortcutAction } from './editorShortcuts.ts';

const press = (key: string, mods: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
	key,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	...mods,
});

describe('shortcutAction', () => {
	it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo', () => {
		expect(shortcutAction(press('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
		expect(shortcutAction(press('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
		expect(shortcutAction(press('y', { ctrlKey: true }))).toEqual({ type: 'redo' });
	});

	it('Ctrl+D duplicates, Ctrl+G groups, Ctrl+Shift+G ungroups, Ctrl+A selects everything', () => {
		expect(shortcutAction(press('d', { ctrlKey: true }))).toEqual({ type: 'duplicate' });
		expect(shortcutAction(press('g', { ctrlKey: true }))).toEqual({ type: 'group' });
		expect(shortcutAction(press('G', { ctrlKey: true, shiftKey: true }))).toEqual({ type: 'ungroup' });
		expect(shortcutAction(press('a', { ctrlKey: true }))).toEqual({ type: 'selectAll' });
	});

	it('the Command key works like Ctrl, for Macs', () => {
		expect(shortcutAction(press('z', { metaKey: true }))).toEqual({ type: 'undo' });
		expect(shortcutAction(press('a', { metaKey: true }))).toEqual({ type: 'selectAll' });
	});

	it('D on its own drops the selection to the workplane', () => {
		expect(shortcutAction(press('d'))).toEqual({ type: 'dropToPlane' });
		expect(shortcutAction(press('D', { shiftKey: true }))).toEqual({ type: 'dropToPlane' });
	});

	it('Delete and Backspace delete, Escape clears the selection', () => {
		expect(shortcutAction(press('Delete'))).toEqual({ type: 'delete' });
		expect(shortcutAction(press('Backspace'))).toEqual({ type: 'delete' });
		expect(shortcutAction(press('Escape'))).toEqual({ type: 'clearSelection' });
	});

	it('does not delete or clear when Ctrl is held (those are other shortcuts)', () => {
		expect(shortcutAction(press('Delete', { ctrlKey: true }))).toBeNull();
		expect(shortcutAction(press('Escape', { ctrlKey: true }))).toBeNull();
	});

	it('does not drop to the plane when Ctrl is held (Ctrl+D duplicates instead)', () => {
		expect(shortcutAction(press('d', { ctrlKey: true }))).not.toEqual({ type: 'dropToPlane' });
	});

	it('ignores anything with Alt held, so browser and system shortcuts are left alone', () => {
		expect(shortcutAction(press('z', { ctrlKey: true, altKey: true }))).toBeNull();
		expect(shortcutAction(press('d', { altKey: true }))).toBeNull();
		expect(shortcutAction(press('Delete', { altKey: true }))).toBeNull();
	});

	it('ignores keys that are not shortcuts, including ones that share names with object properties', () => {
		for (const key of ['x', 'Enter', 'ArrowLeft', 'F5', 'constructor', 'toString', '__proto__']) {
			expect(shortcutAction(press(key))).toBeNull();
			expect(shortcutAction(press(key, { ctrlKey: true }))).toBeNull();
		}
	});
});
