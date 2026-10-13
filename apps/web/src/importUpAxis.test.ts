import { describe, expect, it } from 'vitest';
import { readUpAxis, writeUpAxis } from './importUpAxis.ts';

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

describe('remembering which way is up for imports', () => {
	it('starts as Z, and gives back what was saved', () => {
		const storage = memory();
		expect(readUpAxis(storage)).toBe('z');
		writeUpAxis(storage, 'y');
		expect(readUpAxis(storage)).toBe('y');
		writeUpAxis(storage, 'z');
		expect(readUpAxis(storage)).toBe('z');
	});

	it('ignores anything else that was stored', () => {
		expect(readUpAxis(memory({ 'holecraft.importUp': 'x' }))).toBe('z');
	});

	it('carries on when the browser blocks storage', () => {
		expect(readUpAxis(blocked)).toBe('z');
		expect(() => writeUpAxis(blocked, 'y')).not.toThrow();
		expect(readUpAxis(undefined)).toBe('z');
	});
});
