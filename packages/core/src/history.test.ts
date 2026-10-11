import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, pushHistory, redo, replacePresent, undo } from './history.ts';

describe('history', () => {
	it('starts with nothing to undo or redo', () => {
		const h = createHistory('a');
		expect(h.present).toBe('a');
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});

	it('undoes and redoes through a sequence of edits', () => {
		let h = createHistory('a');
		h = pushHistory(h, 'b');
		h = pushHistory(h, 'c');
		expect(h.present).toBe('c');

		h = undo(h);
		expect(h.present).toBe('b');
		h = undo(h);
		expect(h.present).toBe('a');
		expect(canUndo(h)).toBe(false);

		h = redo(h);
		h = redo(h);
		expect(h.present).toBe('c');
		expect(canRedo(h)).toBe(false);
	});

	it('is a no-op to undo or redo with nothing available', () => {
		const h = createHistory('a');
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
	});

	it('drops the redo stack when a new edit is made after undoing', () => {
		let h = pushHistory(pushHistory(createHistory('a'), 'b'), 'c');
		h = undo(h);
		h = pushHistory(h, 'd');
		expect(canRedo(h)).toBe(false);
		expect(undo(h).present).toBe('b');
	});

	it('ignores edits that change nothing', () => {
		const h = createHistory('a');
		expect(pushHistory(h, 'a')).toBe(h);
	});

	it('keeps only the most recent entries up to the limit', () => {
		let h = createHistory(0);
		for (let i = 1; i <= 10; i++) h = pushHistory(h, i, h.present, 3);
		expect(h.past).toEqual([7, 8, 9]);
		expect(h.present).toBe(10);
	});

	it('replacePresent changes the current state without adding an undo step', () => {
		let h = createHistory('a');
		h = replacePresent(h, 'b');
		h = replacePresent(h, 'c');
		expect(h.present).toBe('c');
		expect(canUndo(h)).toBe(false);
	});

	it('records a whole live-preview drag as one undo step', () => {
		const start = 'a';
		let h = createHistory(start);
		h = replacePresent(h, 'b');
		h = replacePresent(h, 'c');
		h = pushHistory(h, h.present, start); // commit: one step back to where the drag began
		expect(undo(h).present).toBe('a');
		expect(canUndo(undo(h))).toBe(false);
	});

	it('does not record a drag that ended where it started', () => {
		let h = createHistory('a');
		h = replacePresent(h, 'b');
		h = replacePresent(h, 'a');
		expect(pushHistory(h, h.present, 'a')).toBe(h);
	});
});
