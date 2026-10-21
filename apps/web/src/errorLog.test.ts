import { beforeEach, describe, expect, it } from 'vitest';
import { clearErrors, describeError, MAX_ERRORS, recentErrors, recordError } from './errorLog.ts';

beforeEach(clearErrors);

describe('errorLog', () => {
	it('keeps what was recorded, oldest first, with the time', () => {
		recordError('one', new Date('2026-01-01T00:00:00Z'));
		recordError('two', new Date('2026-01-01T00:00:01Z'));
		expect(recentErrors()).toEqual([
			{ at: '2026-01-01T00:00:00.000Z', message: 'one' },
			{ at: '2026-01-01T00:00:01.000Z', message: 'two' },
		]);
	});

	it('keeps only the latest few', () => {
		for (let i = 0; i < MAX_ERRORS + 5; i++) recordError(`e${i}`);
		const all = recentErrors();
		expect(all).toHaveLength(MAX_ERRORS);
		expect(all.at(-1)?.message).toBe(`e${MAX_ERRORS + 4}`);
		expect(all[0]?.message).toBe('e5');
	});

	it('cuts a very long message', () => {
		recordError('x'.repeat(5000));
		expect(recentErrors()[0]?.message.length).toBeLessThanOrEqual(500);
	});

	it('describes an Error, a string and anything else', () => {
		expect(describeError(new Error('boom'))).toBe('Error: boom');
		expect(describeError('plain')).toBe('plain');
		expect(describeError({ a: 1 })).toBe('Something that is not an error was thrown');
	});

	it('hands out a copy, so the log cannot be changed from outside', () => {
		recordError('one');
		recentErrors().pop();
		expect(recentErrors()).toHaveLength(1);
	});
});
