import { handleHeaders, type StreamFilter } from './capture.ts';
import { CaughtFiles } from './caught.ts';
import { createController } from './controller.ts';
import { diagnose } from './diagnostics.ts';
import type { Request } from './messages.ts';
import { RecentLog } from './recent.ts';
import { EMPTY_SETTINGS, parseSettings } from './settings.ts';
import { type Site, siteOf } from './sites.ts';

/*
 * The add-on's background page: it watches responses in tabs on MakerWorld, Printables and Thingiverse, copies model files and zips as they come
 * down, and does what the popup and settings page ask (send a file to Holecraft or Trident). The rules are in the other modules and tested there;
 * this file only joins them to the browser.
 */

/** The biggest file copied or carried: Holecraft's own import limit. */
const MAX_BYTES = 100 * 1024 * 1024;

const files = new CaughtFiles();
const log = new RecentLog();
/** Which tabs are on a supported site now, so a response can be placed without asking the browser. */
const siteTabs = new Map<number, Site>();

const track = (tabId: number, url: string | undefined) => {
	const site = url ? siteOf(url) : null;
	if (site) siteTabs.set(tabId, site);
	else siteTabs.delete(tabId);
};

/** The toolbar button says how many files are waiting. */
function showCount() {
	const count = files.count();
	void browser.browserAction.setBadgeText({ text: count > 0 ? String(count) : '' });
	void browser.browserAction.setBadgeBackgroundColor({ color: '#0f766e' });
}

const handle = createController({
	files,
	log,
	loadSettings: async () => parseSettings((await browser.storage.local.get('settings')).settings ?? EMPTY_SETTINGS),
	saveSettings: async (settings) => {
		await browser.storage.local.set({ settings });
	},
	fetchFn: (input, init) => fetch(input, init),
	openTab: async (url) => {
		await browser.tabs.create({ url });
	},
	diagnose: () => diagnose({ browser: browser as unknown as Record<string, unknown>, userAgent: navigator.userAgent }),
	onChange: showCount,
	maxBytes: MAX_BYTES,
});

// the browser's answer to a message is the promise this returns
browser.runtime.onMessage.addListener((message: unknown) => handle(message as Request));

void browser.tabs.query({}).then((tabs) => {
	for (const tab of tabs) if (tab.id !== undefined) track(tab.id, tab.url);
});
browser.tabs.onUpdated.addListener((tabId, change, tab) => {
	if (change.url !== undefined || tab.url !== undefined) track(tabId, change.url ?? tab.url);
});
browser.tabs.onRemoved.addListener((tabId) => {
	siteTabs.delete(tabId);
});

// `filterResponseData` is missing in some browsers: then only the address of a download is kept
const webRequest = browser.webRequest as typeof browser.webRequest & { filterResponseData?: (id: string) => unknown };
const filterResponseData =
	typeof webRequest.filterResponseData === 'function' ? (id: string) => webRequest.filterResponseData?.(id) as StreamFilter : undefined;

browser.webRequest.onHeadersReceived.addListener(
	(details) => {
		try {
			handleHeaders(details, {
				files,
				log,
				siteOfTab: (id) => siteTabs.get(id) ?? null,
				filterResponseData,
				maxBytes: MAX_BYTES,
				onChange: showCount,
			});
		} catch {
			// a problem with one response must never get in the way of the page
		}
		return {};
	},
	{ urls: ['<all_urls>'], types: ['main_frame', 'sub_frame', 'xmlhttprequest', 'other'] },
	['blocking', 'responseHeaders'],
);

showCount();
