import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type CaptureDeps, handleHeaders, type StreamFilter } from './capture.ts';
import { CaughtFiles } from './caught.ts';
import { RecentLog } from './recent.ts';
import { SITES } from './sites.ts';

/** A stream filter as the browser gives one: it is fed chunks, and what it is told to write goes on to the page. */
class FakeFilter implements StreamFilter {
	ondata: ((e: { data: ArrayBuffer }) => void) | null = null;
	onstop: (() => void) | null = null;
	onerror: (() => void) | null = null;
	written: number[][] = [];
	disconnected = false;
	write(data: ArrayBuffer) {
		this.written.push([...new Uint8Array(data)]);
	}
	disconnect() {
		this.disconnected = true;
	}
	feed(...chunks: number[][]) {
		for (const c of chunks) this.ondata?.({ data: new Uint8Array(c).buffer });
	}
	stop() {
		this.onstop?.();
	}
}

let files: CaughtFiles;
let log: RecentLog;
let filter: FakeFilter;
let changed: number;
let deps: CaptureDeps;

const details = (over: Record<string, unknown> = {}) => ({
	requestId: '1',
	tabId: 7,
	url: 'https://cdn.example.com/files/abc',
	statusCode: 200,
	type: 'main_frame',
	responseHeaders: [
		{ name: 'Content-Disposition', value: 'attachment; filename="Gear.stl"' },
		{ name: 'Content-Type', value: 'application/octet-stream' },
		{ name: 'Content-Length', value: '5' },
	],
	...over,
});

beforeEach(() => {
	files = new CaughtFiles({ maxFiles: 5, maxBytes: 1000 });
	log = new RecentLog();
	filter = new FakeFilter();
	changed = 0;
	deps = {
		files,
		log,
		siteOfTab: (tabId) => (tabId === 7 ? SITES[0]! : null),
		filterResponseData: () => filter,
		maxBytes: 100,
		onChange: () => {
			changed++;
		},
	};
});

describe('handleHeaders', () => {
	it('copies a model that comes down on a supported site, passing every piece on to the page untouched', () => {
		handleHeaders(details(), deps);
		filter.feed([1, 2], [3, 4, 5]);
		expect(filter.written).toEqual([
			[1, 2],
			[3, 4, 5],
		]);
		expect(files.count()).toBe(0); // not until it has all come
		filter.stop();
		expect(filter.disconnected).toBe(true);
		const [one] = files.list();
		expect(one).toMatchObject({ name: 'Gear.stl', kind: 'model', size: 5, site: 'MakerWorld', ready: true });
		expect([...files.get(one!.id)!.bytes!]).toEqual([1, 2, 3, 4, 5]);
		expect(files.get(one!.id)?.url).toBe('https://cdn.example.com/files/abc');
		expect(changed).toBe(1);
	});

	it('does nothing for a tab that is not on a supported site', () => {
		const spy = vi.fn(() => filter);
		handleHeaders(details({ tabId: 99 }), { ...deps, filterResponseData: spy });
		expect(spy).not.toHaveBeenCalled();
		expect(files.count()).toBe(0);
		expect(log.list()).toEqual([]);
	});

	it('knows a download opened in a new tab by the page that started it, or by being from the site itself', () => {
		handleHeaders(details({ tabId: 99, originUrl: 'https://makerworld.com/en/models/1' }), deps);
		filter.feed([1]);
		filter.stop();
		expect(files.list()[0]?.site).toBe('MakerWorld');
		filter = new FakeFilter();
		handleHeaders(details({ tabId: 99, requestId: '2', url: 'https://www.printables.com/download/abc/file.stl' }), deps);
		filter.feed([2]);
		filter.stop();
		expect(files.list().map((f) => f.site)).toContain('Printables');
	});

	it('does not take a file from a page on another site that merely names a supported site in its address', () => {
		const spy = vi.fn(() => filter);
		handleHeaders(details({ tabId: 99, originUrl: 'https://evil.example/?u=makerworld.com' }), { ...deps, filterResponseData: spy });
		expect(spy).not.toHaveBeenCalled();
	});

	it('does nothing for something that is not a model or a zip', () => {
		const spy = vi.fn(() => filter);
		handleHeaders(details({ responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] }), { ...deps, filterResponseData: spy });
		expect(spy).not.toHaveBeenCalled();
		expect(files.count()).toBe(0);
	});

	it('reads header names whatever their case', () => {
		handleHeaders(
			details({
				responseHeaders: [
					{ name: 'content-disposition', value: 'attachment; filename=a.3mf' },
					{ name: 'CONTENT-TYPE', value: 'x/y' },
				],
			}),
			deps,
		);
		filter.feed([9]);
		filter.stop();
		expect(files.list()[0]?.name).toBe('a.3mf');
	});

	it('keeps only the address when the browser cannot copy a download (so it is fetched again when wanted)', () => {
		handleHeaders(details(), { ...deps, filterResponseData: undefined });
		expect(files.list()[0]).toMatchObject({ name: 'Gear.stl', ready: false });
		expect(changed).toBe(1);
	});

	it('keeps only the address when copying fails part way, and still lets the page have what came', () => {
		handleHeaders(details(), deps);
		filter.feed([1, 2]);
		filter.onerror?.();
		expect(filter.written).toEqual([[1, 2]]);
		expect(files.list()[0]).toMatchObject({ ready: false });
	});

	it('does not copy a file the server says is bigger than it will take, and says so in the log', () => {
		const spy = vi.fn(() => filter);
		handleHeaders(
			details({
				responseHeaders: [
					{ name: 'Content-Disposition', value: 'attachment; filename=big.stl' },
					{ name: 'Content-Length', value: '5000' },
				],
			}),
			{
				...deps,
				filterResponseData: spy,
			},
		);
		expect(spy).not.toHaveBeenCalled();
		expect(files.count()).toBe(0);
		expect(log.list()[0]?.note).toMatch(/too large/i);
	});

	it('stops copying a file that turns out bigger than it said, and keeps only its address', () => {
		handleHeaders(details({ responseHeaders: [{ name: 'Content-Disposition', value: 'attachment; filename=a.stl' }] }), deps);
		filter.feed(Array(60).fill(1), Array(60).fill(2));
		filter.stop();
		expect(filter.written).toHaveLength(2);
		expect(files.list()[0]).toMatchObject({ ready: false });
	});

	it('keeps one entry when the same address comes down twice', () => {
		handleHeaders(details(), deps);
		filter.feed([1]);
		filter.stop();
		filter = new FakeFilter();
		handleHeaders(details({ requestId: '2' }), deps);
		filter.feed([2]);
		filter.stop();
		expect(files.list()).toHaveLength(1);
		expect([...files.get(files.list()[0]!.id)!.bytes!]).toEqual([2]);
	});

	it('writes what it sees into the log, without the address’s query (which can hold a signed key)', () => {
		handleHeaders(details({ url: 'https://cdn.example.com/files/abc?token=SECRET&sig=xyz' }), deps);
		const entry = log.list()[0]!;
		expect(JSON.stringify(entry)).not.toContain('SECRET');
		expect(JSON.stringify(entry)).not.toContain('sig=');
		expect(entry).toMatchObject({ site: 'MakerWorld', status: 200, name: 'Gear.stl', kind: 'model' });
	});

	it('logs a download that it did not take for a model too, so it can be seen why', () => {
		handleHeaders(
			details({
				responseHeaders: [
					{ name: 'Content-Disposition', value: 'attachment; filename="photo.png"' },
					{ name: 'Content-Type', value: 'image/png' },
				],
			}),
			deps,
		);
		expect(log.list()[0]).toMatchObject({ name: 'photo.png', kind: null });
		expect(files.count()).toBe(0);
	});
});

describe('handleHeaders tells when a file has been caught', () => {
	it('says which file and in which tab, once all of it has come down', () => {
		const caught: [string, number][] = [];
		handleHeaders(details(), { ...deps, onCaught: (id, tab) => caught.push([id, tab]) });
		filter.feed([1, 2, 3]);
		expect(caught).toEqual([]);
		filter.stop();
		expect(caught).toHaveLength(1);
		expect(caught[0]![0]).toBe(files.list()[0]!.id);
		expect(caught[0]![1]).toBe(7);
	});

	it('says so for a file kept as its address only, too', () => {
		const caught: [string, number][] = [];
		handleHeaders(details(), { ...deps, filterResponseData: undefined, onCaught: (id, tab) => caught.push([id, tab]) });
		expect(caught).toHaveLength(1);
	});

	it('says so once when copying fails part way', () => {
		const caught: string[] = [];
		handleHeaders(details(), { ...deps, onCaught: (id) => caught.push(id) });
		filter.feed([1]);
		filter.onerror?.();
		filter.stop();
		expect(caught).toHaveLength(1);
	});

	it('says nothing for what is not a model or a zip', () => {
		const caught: string[] = [];
		handleHeaders(details({ responseHeaders: [{ name: 'Content-Type', value: 'text/html' }] }), {
			...deps,
			onCaught: (id) => caught.push(id),
		});
		expect(caught).toEqual([]);
	});

	it('does not need anyone to listen', () => {
		handleHeaders(details(), deps);
		filter.feed([1]);
		expect(() => filter.stop()).not.toThrow();
	});
});
