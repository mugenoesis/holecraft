import { describe, expect, it } from 'vitest';
import { SITES, siteOf } from './sites.ts';

describe('siteOf', () => {
	it('knows the three sites, with or without www or another subdomain', () => {
		expect(siteOf('https://makerworld.com/en/models/123')?.name).toBe('MakerWorld');
		expect(siteOf('https://www.printables.com/model/1-gear')?.name).toBe('Printables');
		expect(siteOf('https://www.thingiverse.com/thing:4711')?.name).toBe('Thingiverse');
		expect(siteOf('https://api.makerworld.com/x')?.id).toBe('makerworld');
	});

	it('does not take a look-alike address for one of them', () => {
		for (const url of [
			'https://evilmakerworld.com/',
			'https://makerworld.com.evil.net/',
			'https://notprintables.com/',
			'https://thingiverse.com.example.org/thing:1',
			'https://example.com/?u=https://makerworld.com/',
			'https://example.com/makerworld.com',
		]) {
			expect(siteOf(url), url).toBeNull();
		}
	});

	it('is null for anything that is not an ordinary web address', () => {
		for (const url of [
			'',
			'not a url',
			'about:blank',
			'moz-extension://abc/popup.html',
			'file:///makerworld.com',
			'ftp://makerworld.com/',
		]) {
			expect(siteOf(url), url).toBeNull();
		}
	});

	it('lists each site once, by a name the popup can show', () => {
		expect(SITES.map((s) => s.id)).toEqual(['makerworld', 'printables', 'thingiverse']);
		expect(new Set(SITES.map((s) => s.name)).size).toBe(3);
	});
});
