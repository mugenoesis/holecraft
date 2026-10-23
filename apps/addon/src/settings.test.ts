import { describe, expect, it } from 'vitest';
import { EMPTY_SETTINGS, normaliseUrl, parseSettings } from './settings.ts';

describe('normaliseUrl', () => {
	it('keeps an address as it is, without a closing slash', () => {
		expect(normaliseUrl('http://192.168.1.3:8200')).toBe('http://192.168.1.3:8200');
		expect(normaliseUrl('http://192.168.1.3:8200/')).toBe('http://192.168.1.3:8200');
		expect(normaliseUrl('https://holecraft.example.com/')).toBe('https://holecraft.example.com');
	});

	it('adds http:// when only a host (and port) was typed, as people do', () => {
		expect(normaliseUrl('192.168.1.3:8200')).toBe('http://192.168.1.3:8200');
		expect(normaliseUrl('  tower.local:8000 ')).toBe('http://tower.local:8000');
	});

	it('keeps a path (a server behind a prefix), without the closing slash, and drops a query or a fragment', () => {
		expect(normaliseUrl('http://host/holecraft/')).toBe('http://host/holecraft');
		expect(normaliseUrl('http://host/app?x=1#top')).toBe('http://host/app');
	});

	it('is null for nothing, for another kind of address, and for one with a login in it', () => {
		for (const text of [
			'',
			'   ',
			'ftp://host',
			'file:///etc/passwd',
			'javascript:alert(1)',
			'http://user:pw@host',
			'http://',
			'not a url!',
			'http://exa mple.com',
		]) {
			expect(normaliseUrl(text), text).toBeNull();
		}
	});
});

describe('parseSettings', () => {
	it('keeps good settings, with the addresses made tidy', () => {
		expect(parseSettings({ holecraftUrl: 'tower:8200/', tridentUrl: 'http://tower:8000', tridentKey: ' abc ' })).toEqual({
			holecraftUrl: 'http://tower:8200',
			tridentUrl: 'http://tower:8000',
			tridentKey: 'abc',
			showBanner: true,
			showNotification: false,
			deleteAfterSend: false,
		});
	});

	it('starts empty, for nothing or for something that is not settings', () => {
		expect(parseSettings(undefined)).toEqual(EMPTY_SETTINGS);
		expect(parseSettings(null)).toEqual(EMPTY_SETTINGS);
		expect(parseSettings('x')).toEqual(EMPTY_SETTINGS);
		expect(parseSettings({ holecraftUrl: 5, tridentUrl: {}, tridentKey: [] })).toEqual(EMPTY_SETTINGS);
	});

	it('tells you about a file that is caught with a banner on the page, and not with a notification, unless that is chosen', () => {
		expect(EMPTY_SETTINGS.showBanner).toBe(true);
		expect(EMPTY_SETTINGS.showNotification).toBe(false);
		const off = parseSettings({ showBanner: false, showNotification: false });
		expect([off.showBanner, off.showNotification]).toEqual([false, false]);
		const both = parseSettings({ showBanner: true, showNotification: true });
		expect([both.showBanner, both.showNotification]).toEqual([true, true]);
	});

	it('does not delete the downloaded file after sending unless that is chosen (and only a clear yes counts)', () => {
		expect(EMPTY_SETTINGS.deleteAfterSend).toBe(false);
		expect(parseSettings({ deleteAfterSend: true }).deleteAfterSend).toBe(true);
		for (const odd of ['yes', 1, 'true', null, {}, [true]])
			expect(parseSettings({ deleteAfterSend: odd }).deleteAfterSend, String(odd)).toBe(false);
	});

	it('takes anything that is not true or false to mean the usual', () => {
		const odd = parseSettings({ showBanner: 'no', showNotification: 1 });
		expect([odd.showBanner, odd.showNotification]).toEqual([true, false]);
	});

	it('leaves out an address that is not one', () => {
		expect(parseSettings({ holecraftUrl: 'ftp://x', tridentUrl: 'http://ok:1' })).toEqual({ ...EMPTY_SETTINGS, tridentUrl: 'http://ok:1' });
	});
});
