import { describe, expect, it } from 'vitest';
import { createEmptyDesign } from './design.ts';
import { parseDesign } from './validate.ts';
import { clearZeroPoint, setZeroPoint } from './zeroSetting.ts';

describe('the saved zero point', () => {
	const base = createEmptyDesign('0123456789abcdef0123456789abcdef', 'D');

	it('is set with its place and turns, and read back by parseDesign', () => {
		const d = setZeroPoint(base, [12.5, -3], 2);
		expect(d.zero).toEqual({ x: 12.5, y: -3, turns: 2 });
		expect(parseDesign(JSON.parse(JSON.stringify(d))).zero).toEqual({ x: 12.5, y: -3, turns: 2 });
	});

	it('gives the same design back when nothing changes', () => {
		const d = setZeroPoint(base, [1, 2], 0);
		expect(setZeroPoint(d, [1, 2], 0)).toBe(d);
		expect(clearZeroPoint(base)).toBe(base);
	});

	it('is cleared by leaving the field out', () => {
		const d = clearZeroPoint(setZeroPoint(base, [1, 2], 1));
		expect('zero' in d).toBe(false);
	});

	it('refuses a point that is not a finite number', () => {
		expect(setZeroPoint(base, [Number.NaN, 0], 0)).toBe(base);
		expect(setZeroPoint(base, [0, Number.POSITIVE_INFINITY], 0)).toBe(base);
	});

	it('is checked on the way in: junk is refused, an old design has none', () => {
		const raw = JSON.parse(JSON.stringify(base));
		expect(parseDesign(raw).zero).toBeUndefined();
		expect(() => parseDesign({ ...raw, zero: { x: 'a', y: 0, turns: 0 } })).toThrow();
		expect(() => parseDesign({ ...raw, zero: { x: 0, y: 0, turns: 4 } })).toThrow();
		expect(() => parseDesign({ ...raw, zero: { x: 1e9, y: 0, turns: 0 } })).toThrow();
	});
});
