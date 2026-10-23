import type { CaughtView } from './caught.ts';
import { noticeText } from './popupModel.ts';
import type { Settings } from './settings.ts';

export interface NotifyDeps {
	settings: () => Promise<Settings>;
	/** The caught file as the popup lists it, or null once it is gone. */
	describe: (id: string) => CaughtView | null;
	/** Puts the banner for a file on the page open in a tab. */
	showBanner: (tabId: number, id: string) => Promise<void>;
	/** Gives the browser's own notification. */
	showNotification: (id: string, text: { title: string; message: string }) => Promise<void>;
}

/**
 * Tells the user a file was caught, the ways they have chosen: a banner on the page it came down in (with the buttons to send it), and/or a
 * notification from the browser. A way that cannot work here (the tab is gone, the browser has no notifications) is skipped and never gets in the
 * way of the other.
 */
export async function announceCaught(id: string, tabId: number, deps: NotifyDeps): Promise<void> {
	let settings: Settings;
	try {
		settings = await deps.settings();
	} catch {
		return;
	}
	const file = deps.describe(id);
	if (!file) return;
	if (settings.showBanner && tabId >= 0) await deps.showBanner(tabId, id).catch(() => undefined);
	if (settings.showNotification) await deps.showNotification(id, noticeText(file)).catch(() => undefined);
}
