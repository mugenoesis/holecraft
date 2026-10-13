import { describe, expect, it } from 'vitest';
import { readSimpleThreads, writeSimpleThreads } from './useSimpleThreads.ts';

const memory = (initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> => {
	const data = { ...initial };
	return {
		getItem: (k) => data[k] ?? null,
		setItem: (k, v) => {
			data[k] = v;
		},
	};
};
const blocked: Pick<Storage, 'getItem' | 'setItem'> = {
	getItem: () => {
		throw new Error('blocked');
	},
	setItem: () => {
		throw new Error('blocked');
	},
};

describe('remembering the simple threads switch', () => {
	it('starts off, and gives back what was saved', () => {
		const storage = memory();
		expect(readSimpleThreads(storage)).toBe(false);
		writeSimpleThreads(storage, true);
		expect(readSimpleThreads(storage)).toBe(true);
		writeSimpleThreads(storage, false);
		expect(readSimpleThreads(storage)).toBe(false);
	});

	it('ignores anything else that was stored', () => {
		expect(readSimpleThreads(memory({ 'holecraft.simpleThreads': 'yes' }))).toBe(false);
	});

	it('carries on when the browser blocks storage: off, and saving does not throw', () => {
		expect(readSimpleThreads(blocked)).toBe(false);
		expect(() => writeSimpleThreads(blocked, true)).not.toThrow();
		expect(readSimpleThreads(undefined)).toBe(false);
	});
});
