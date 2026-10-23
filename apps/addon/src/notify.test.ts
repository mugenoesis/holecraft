import { describe, expect, it, vi } from 'vitest';
import type { CaughtView } from './caught.ts';
import { announceCaught, type NotifyDeps } from './notify.ts';
import { EMPTY_SETTINGS, type Settings } from './settings.ts';

const view: CaughtView = { id: 'f1', name: 'Gear.stl', kind: 'model', size: 1024, site: 'MakerWorld', at: 1, ready: true };
const make = (settings: Partial<Settings> = {}, over: Partial<NotifyDeps> = {}) => {
	const deps: NotifyDeps = {
		settings: async () => ({ ...EMPTY_SETTINGS, ...settings }),
		describe: (id) => (id === 'f1' ? view : null),
		showBanner: vi.fn(async () => {}),
		showNotification: vi.fn(async () => {}),
		...over,
	};
	return deps;
};

describe('announceCaught', () => {
	it('puts a banner on the page it came down in, and by default nothing else', async () => {
		const deps = make();
		await announceCaught('f1', 7, deps);
		expect(deps.showBanner).toHaveBeenCalledWith(7, 'f1');
		expect(deps.showNotification).not.toHaveBeenCalled();
	});

	it('also gives a notification from the browser when that is chosen', async () => {
		const deps = make({ showNotification: true });
		await announceCaught('f1', 7, deps);
		expect(deps.showBanner).toHaveBeenCalledTimes(1);
		expect(deps.showNotification).toHaveBeenCalledWith('f1', { title: 'Holecraft Send', message: expect.stringContaining('Gear.stl') });
	});

	it('gives a notification alone when the banner is turned off', async () => {
		const deps = make({ showBanner: false, showNotification: true });
		await announceCaught('f1', 7, deps);
		expect(deps.showBanner).not.toHaveBeenCalled();
		expect(deps.showNotification).toHaveBeenCalledTimes(1);
	});

	it('says nothing at all when both are turned off', async () => {
		const deps = make({ showBanner: false, showNotification: false });
		await announceCaught('f1', 7, deps);
		expect(deps.showBanner).not.toHaveBeenCalled();
		expect(deps.showNotification).not.toHaveBeenCalled();
	});

	it('has no banner for a file that came down in no tab, but still gives the notification', async () => {
		const deps = make({ showNotification: true });
		await announceCaught('f1', -1, deps);
		expect(deps.showBanner).not.toHaveBeenCalled();
		expect(deps.showNotification).toHaveBeenCalledTimes(1);
	});

	it('does not fall over when the banner cannot be shown (the tab is gone), and still gives the notification', async () => {
		const deps = make({ showNotification: true }, { showBanner: vi.fn().mockRejectedValue(new Error('no tab')) });
		await expect(announceCaught('f1', 7, deps)).resolves.toBeUndefined();
		expect(deps.showNotification).toHaveBeenCalledTimes(1);
	});

	it('does not fall over when the notification cannot be shown (this browser has none)', async () => {
		const deps = make({ showNotification: true }, { showNotification: vi.fn().mockRejectedValue(new Error('unsupported')) });
		await expect(announceCaught('f1', 7, deps)).resolves.toBeUndefined();
		expect(deps.showBanner).toHaveBeenCalledTimes(1);
	});

	it('says nothing for a file that is no longer there', async () => {
		const deps = make({ showNotification: true });
		await announceCaught('gone', 7, deps);
		expect(deps.showBanner).not.toHaveBeenCalled();
		expect(deps.showNotification).not.toHaveBeenCalled();
	});

	it('does not fall over when the settings cannot be read', async () => {
		const deps = make({}, { settings: async () => Promise.reject(new Error('storage')) });
		await expect(announceCaught('f1', 7, deps)).resolves.toBeUndefined();
	});
});
