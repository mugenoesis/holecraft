import { describe, expect, it } from 'vitest';
import { readRulerSnap, writeRulerSnap } from './rulerSnapSetting.ts';

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

describe('remembering whether the ruler snaps', () => {
	it('starts on, and gives back what was saved', () => {
		const storage = memory();
		expect(readRulerSnap(storage)).toBe(true);
		writeRulerSnap(storage, false);
		expect(readRulerSnap(storage)).toBe(false);
		writeRulerSnap(storage, true);
		expect(readRulerSnap(storage)).toBe(true);
	});

	it('is on unless it was switched off, whatever else was stored', () => {
		expect(readRulerSnap(memory({ 'holecraft.rulerSnap': 'maybe' }))).toBe(true);
	});

	it('carries on when the browser blocks storage', () => {
		expect(readRulerSnap(blocked)).toBe(true);
		expect(() => writeRulerSnap(blocked, false)).not.toThrow();
		expect(readRulerSnap(undefined)).toBe(true);
	});
});
