import { describe, expect, it } from 'vitest';
import { diagnosticsText, REPORT_URL, reportUrl, type SystemInfo } from './bugReport.ts';

const info: SystemInfo = {
	version: '0.4.2',
	userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130',
	platform: 'Linux x86_64',
	screen: '1920x1080',
};

describe('reportUrl', () => {
	const url = new URL(reportUrl(info));
	const body = url.searchParams.get('body') ?? '';

	it('opens a new issue in the Holecraft repository', () => {
		expect(`${url.origin}${url.pathname}`).toBe(REPORT_URL);
		expect(REPORT_URL).toBe('https://github.com/mugenoesis/holecraft/issues/new');
	});

	it('fills in the version, browser, platform and screen', () => {
		expect(body).toContain('0.4.2');
		expect(body).toContain('Mozilla/5.0 (X11; Linux x86_64) Chrome/130');
		expect(body).toContain('Linux x86_64');
		expect(body).toContain('1920x1080');
	});

	it('reminds the reporter to say what happened and to attach a screenshot', () => {
		expect(body).toMatch(/what happened/i);
		expect(body).toMatch(/screenshot/i);
	});

	it('never carries design data', () => {
		expect(body).not.toMatch(/design [0-9a-f]{32}/);
	});

	it('survives odd characters in the details', () => {
		const odd = new URL(reportUrl({ ...info, userAgent: 'A&B=C#D %20 ü' }));
		expect(odd.searchParams.get('body')).toContain('A&B=C#D %20 ü');
	});
});

describe('diagnosticsText', () => {
	it('lists the system and says when there are no errors', () => {
		const text = diagnosticsText(info, []);
		expect(text).toContain('Holecraft 0.4.2');
		expect(text).toContain('Linux x86_64');
		expect(text).toMatch(/no errors/i);
	});

	it('lists the recent errors, oldest first', () => {
		const text = diagnosticsText(info, [
			{ at: '2026-01-01T10:00:00.000Z', message: 'first' },
			{ at: '2026-01-01T10:01:00.000Z', message: 'second' },
		]);
		expect(text).toContain('2026-01-01T10:00:00.000Z first');
		expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'));
	});
});
