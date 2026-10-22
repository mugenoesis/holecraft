import { describe, expect, it } from 'vitest';
import { versionDetail, versionWhen } from './versionHistory.ts';

const now = new Date(2026, 0, 15, 14, 30);

describe('versionWhen', () => {
	it('says today, and the time', () => {
		expect(versionWhen(new Date(2026, 0, 15, 9, 5).toISOString(), now)).toBe('Today, 09:05');
	});

	it('says yesterday', () => {
		expect(versionWhen(new Date(2026, 0, 14, 23, 59).toISOString(), now)).toBe('Yesterday, 23:59');
	});

	it('gives the day and month for an earlier day this year, and the year for an earlier year', () => {
		expect(versionWhen(new Date(2026, 0, 3, 10, 0).toISOString(), now)).toBe('3 Jan, 10:00');
		expect(versionWhen(new Date(2025, 11, 31, 18, 45).toISOString(), now)).toBe('31 Dec 2025, 18:45');
	});

	it('is told apart by the calendar day, not by 24 hours', () => {
		const lateNow = new Date(2026, 0, 15, 0, 10);
		expect(versionWhen(new Date(2026, 0, 14, 23, 50).toISOString(), lateNow)).toBe('Yesterday, 23:50');
	});

	it('shows what it was given when it is not a time', () => {
		expect(versionWhen('not a time', now)).toBe('not a time');
	});
});

describe('versionDetail', () => {
	it('names the design and counts what was in it', () => {
		expect(versionDetail({ name: 'Bracket', objectCount: 3 })).toBe('Bracket · 3 objects');
		expect(versionDetail({ name: 'Bracket', objectCount: 1 })).toBe('Bracket · 1 object');
		expect(versionDetail({ name: 'Bracket', objectCount: 0 })).toBe('Bracket · empty');
	});
});
