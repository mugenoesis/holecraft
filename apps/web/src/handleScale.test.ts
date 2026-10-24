import { describe, expect, it } from 'vitest';
import { clampHandleScale, MAX_HANDLE_SCALE, MIN_HANDLE_SCALE, readHandleScale, writeHandleScale } from './handleScale.ts';

const memory = (initial?: string) => {
	let value = initial;
	return {
		getItem: () => value ?? null,
		setItem: (_: string, v: string) => {
			value = v;
		},
	};
};

describe('handle scale', () => {
	it('limits to the range and rounds to a hundredth', () => {
		expect(clampHandleScale(0)).toBe(MIN_HANDLE_SCALE);
		expect(clampHandleScale(99)).toBe(MAX_HANDLE_SCALE);
		expect(clampHandleScale(1.2345)).toBe(1.23);
		expect(clampHandleScale(Number.NaN)).toBe(1);
	});

	it('reads 1 when nothing or junk is stored', () => {
		expect(readHandleScale(undefined)).toBe(1);
		expect(readHandleScale(memory())).toBe(1);
		expect(readHandleScale(memory('abc'))).toBe(1);
	});

	it('keeps what was written', () => {
		const store = memory();
		writeHandleScale(store, 1.5);
		expect(readHandleScale(store)).toBe(1.5);
	});
});
