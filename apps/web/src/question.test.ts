import { describe, expect, it, vi } from 'vitest';
import { createQuestion } from './question.ts';

describe('createQuestion', () => {
	it('is not pending until it is asked, is pending while waiting, and gives the answer', async () => {
		const q = createQuestion<'yes' | 'no'>();
		expect(q.pending()).toBe(false);
		const answer = q.ask();
		expect(q.pending()).toBe(true);
		q.answer('yes');
		await expect(answer).resolves.toBe('yes');
		expect(q.pending()).toBe(false);
	});

	it('tells the listener each time it becomes pending or is answered, until it stops listening', () => {
		const q = createQuestion<string>();
		const seen = vi.fn();
		const stop = q.subscribe(seen);
		void q.ask();
		q.answer('x');
		expect(seen).toHaveBeenCalledTimes(2);
		stop();
		void q.ask();
		expect(seen).toHaveBeenCalledTimes(2);
	});

	it('an answer with nothing asked does nothing', () => {
		const q = createQuestion<string>();
		expect(() => q.answer('x')).not.toThrow();
		expect(q.pending()).toBe(false);
	});

	it('asking again while one is open gives the same answer to both', async () => {
		const q = createQuestion<string>();
		const first = q.ask();
		const second = q.ask();
		q.answer('once');
		await expect(Promise.all([first, second])).resolves.toEqual(['once', 'once']);
	});
});
