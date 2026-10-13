import { describe, expect, it } from 'vitest';
import { isTextEntry } from './keyboard.ts';

// vitest runs without a DOM here, so the elements are stand-ins with just what the check reads
class FakeElement {
	constructor(
		readonly tagName: string,
		readonly type = '',
		readonly isContentEditable = false,
	) {}
}
(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = FakeElement;
const el = (tag: string, type = '', editable = false) => new FakeElement(tag, type, editable) as unknown as EventTarget;

describe('isTextEntry', () => {
	it('is true where typing a digit means a digit: text-like inputs, text areas, selects, editable content', () => {
		for (const type of ['text', 'number', 'search', 'email', 'password', '']) expect(isTextEntry(el('INPUT', type)), type).toBe(true);
		expect(isTextEntry(el('TEXTAREA'))).toBe(true);
		expect(isTextEntry(el('SELECT'))).toBe(true);
		expect(isTextEntry(el('DIV', '', true))).toBe(true);
	});

	it('is false on a radio button, a checkbox, a slider or a button, where a digit key has no job of its own', () => {
		for (const type of ['radio', 'checkbox', 'range', 'button']) expect(isTextEntry(el('INPUT', type)), type).toBe(false);
		expect(isTextEntry(el('BUTTON'))).toBe(false);
	});

	it('is false for nothing at all (the page itself)', () => {
		expect(isTextEntry(null)).toBe(false);
	});
});
