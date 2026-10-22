import { describe, expect, it } from 'vitest';
import { RecentLog } from './recent.ts';

const entry = (n: number) => ({
	at: n,
	site: 'MakerWorld',
	url: `https://x/${n}`,
	status: 200,
	contentType: 't',
	disposition: 'd',
	name: null,
	kind: null,
	note: '',
});

describe('RecentLog', () => {
	it('keeps what it is given, newest first', () => {
		const log = new RecentLog(5);
		log.add(entry(1));
		log.add(entry(2));
		expect(log.list().map((e) => e.at)).toEqual([2, 1]);
	});

	it('keeps only the most recent', () => {
		const log = new RecentLog(3);
		for (let i = 1; i <= 5; i++) log.add(entry(i));
		expect(log.list().map((e) => e.at)).toEqual([5, 4, 3]);
	});

	it('can be emptied', () => {
		const log = new RecentLog();
		log.add(entry(1));
		log.clear();
		expect(log.list()).toEqual([]);
	});
});
