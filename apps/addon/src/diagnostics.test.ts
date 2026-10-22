import { describe, expect, it } from 'vitest';
import { diagnose } from './diagnostics.ts';

const full = {
	webRequest: { onHeadersReceived: {}, filterResponseData: () => {} },
	tabs: { create: () => {}, onUpdated: {} },
	browserAction: { setBadgeText: () => {} },
	storage: { local: {} },
	runtime: { getManifest: () => ({ version: '1.2.3' }) },
};
const line = (d: ReturnType<typeof diagnose>, label: string) => d.lines.find((l) => l.label === label);

describe('diagnose', () => {
	it('says yes to each thing the add-on needs when the browser has it', () => {
		const d = diagnose({ browser: full, userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0' });
		for (const l of d.lines.filter((l) => l.required)) expect(l.ok, l.label).toBe(true);
	});

	it('says what browser and version it is', () => {
		const d = diagnose({ browser: full, userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0' });
		expect(line(d, 'Browser')?.detail).toContain('Firefox/140.0');
		expect(line(d, 'Browser')?.detail).toMatch(/Android/);
		expect(line(d, 'Add-on version')?.detail).toBe('1.2.3');
	});

	it('says no, and what it means, when the browser cannot copy a download', () => {
		const d = diagnose({ browser: { ...full, webRequest: { onHeadersReceived: {} } }, userAgent: 'x' });
		const copy = line(d, 'Copy a download as it comes down');
		expect(copy?.ok).toBe(false);
		expect(copy?.detail).toMatch(/fetch.*again|address/i);
		expect(copy?.required).toBe(false);
	});

	it('says no to watching downloads when there is no webRequest at all', () => {
		const d = diagnose({ browser: { ...full, webRequest: undefined }, userAgent: 'x' });
		expect(line(d, 'Watch downloads')?.ok).toBe(false);
		expect(line(d, 'Watch downloads')?.required).toBe(true);
	});

	it('does not fall over for a browser that has almost nothing', () => {
		expect(() => diagnose({ browser: {}, userAgent: '' })).not.toThrow();
		expect(line(diagnose({ browser: {}, userAgent: '' }), 'Settings storage')?.ok).toBe(false);
	});
});
