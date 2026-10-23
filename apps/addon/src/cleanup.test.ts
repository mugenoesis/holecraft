import { describe, expect, it } from 'vitest';
import { type DownloadItem, downloadToDelete, mayDeleteDownload } from './cleanup.ts';

const AT = Date.parse('2026-03-01T12:00:00Z');
const item = (over: Partial<DownloadItem> & { id: number }): DownloadItem => ({
	url: 'https://cdn.example.com/other',
	filename: '/home/me/Downloads/other.stl',
	state: 'complete',
	exists: true,
	endTime: new Date(AT - 5_000).toISOString(),
	...over,
});
const file = { url: 'https://cdn.example.com/files/abc', name: 'Gear.stl', at: AT };

describe('downloadToDelete', () => {
	it('is the download that came from the address the file was caught at', () => {
		const items = [item({ id: 1 }), item({ id: 2, url: file.url, filename: '/d/Gear.stl' })];
		expect(downloadToDelete(items, file)).toBe(2);
	});

	it('also finds it by where the address led after redirects, which is the address the response came from', () => {
		const items = [item({ id: 7, url: 'https://site.example.com/download/1', finalUrl: file.url, filename: '/d/whatever.stl' })];
		expect(downloadToDelete(items, file)).toBe(7);
	});

	it('is the one that finished closest to when the file was caught, when the same address was downloaded more than once', () => {
		const items = [
			item({ id: 1, url: file.url, endTime: new Date(AT - 3_600_000).toISOString() }),
			item({ id: 2, url: file.url, endTime: new Date(AT - 2_000).toISOString() }),
			item({ id: 3, url: file.url, endTime: new Date(AT - 90_000).toISOString() }),
		];
		expect(downloadToDelete(items, file)).toBe(2);
	});

	it('finds a download by its name only when it finished within a minute of the catch (the address may have been a different one, such as a signed link)', () => {
		const near = item({ id: 4, filename: '/home/me/Downloads/Gear.stl', endTime: new Date(AT - 20_000).toISOString() });
		expect(downloadToDelete([near], file)).toBe(4);
		const old = item({ id: 5, filename: '/home/me/Downloads/Gear.stl', endTime: new Date(AT - 3_600_000).toISOString() });
		expect(downloadToDelete([old], file)).toBeNull();
	});

	it('reads a name from either kind of path, in any case', () => {
		expect(
			downloadToDelete([item({ id: 1, filename: 'C:\\Users\\me\\Downloads\\GEAR.STL', endTime: new Date(AT).toISOString() })], file),
		).toBe(1);
	});

	it('leaves alone a download that is not finished, or whose file is already gone', () => {
		expect(downloadToDelete([item({ id: 1, url: file.url, state: 'in_progress' })], file)).toBeNull();
		expect(downloadToDelete([item({ id: 1, url: file.url, state: 'interrupted' })], file)).toBeNull();
		expect(downloadToDelete([item({ id: 1, url: file.url, exists: false })], file)).toBeNull();
	});

	it('is nothing when nothing matches: it never guesses at someone’s file', () => {
		expect(downloadToDelete([item({ id: 1 }), item({ id: 2, filename: '/d/Other.stl' })], file)).toBeNull();
		expect(downloadToDelete([], file)).toBeNull();
	});

	it('does not take a file by name when its name is the only thing in common but it is a different kind of file', () => {
		const wrong = item({ id: 9, filename: '/d/Gear.png', endTime: new Date(AT).toISOString() });
		expect(downloadToDelete([wrong], file)).toBeNull();
	});
});

describe('mayDeleteDownload', () => {
	it('is true for a model sent anywhere, and for a zip sent whole to Holecraft', () => {
		expect(mayDeleteDownload('model', 'holecraft')).toBe(true);
		expect(mayDeleteDownload('model', 'trident')).toBe(true);
		expect(mayDeleteDownload('zip', 'holecraft')).toBe(true);
	});

	it('is false for a zip when only one model was taken out of it for Trident (the rest of it would be lost)', () => {
		expect(mayDeleteDownload('zip', 'trident')).toBe(false);
	});
});
