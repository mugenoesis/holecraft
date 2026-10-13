import { describe, expect, it } from 'vitest';
import { tabAfterSelection } from './compactLayout.ts';

/* On a touch screen the side panel shows one tab at a time; selecting something brings up its settings. */

describe('tabAfterSelection', () => {
	it('opens Edit when something is selected from the Shapes tab', () => {
		expect(tabAfterSelection('shapes', 0, 1)).toBe('edit');
	});

	it('goes back to Shapes when the selection is cleared from Edit', () => {
		expect(tabAfterSelection('edit', 2, 0)).toBe('shapes');
	});

	it('leaves the Colours and Objects tabs alone, where picking several things is the point', () => {
		expect(tabAfterSelection('colours', 0, 1)).toBe('colours');
		expect(tabAfterSelection('objects', 0, 1)).toBe('objects');
		expect(tabAfterSelection('objects', 1, 0)).toBe('objects');
	});

	it('does not move when the selection only grows or shrinks', () => {
		expect(tabAfterSelection('shapes', 1, 2)).toBe('shapes');
		expect(tabAfterSelection('edit', 2, 1)).toBe('edit');
		expect(tabAfterSelection('shapes', 0, 0)).toBe('shapes');
	});
});
