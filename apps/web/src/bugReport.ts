import type { LoggedError } from './errorLog.ts';

/* Reporting a problem: a prefilled "new issue" address, and a block of text to paste into it. Nothing is sent
   from here; the address is opened in the user's own browser. No design data goes into either. */

export const REPORT_URL = 'https://github.com/mugenoesis/holecraft/issues/new';

export interface SystemInfo {
	version: string;
	userAgent: string;
	platform: string;
	screen: string;
}

/** What this browser says about itself. `version` comes from the server (the web app has no version of its own). */
export function systemInfo(version: string): SystemInfo {
	// rendered to a string in tests, where there is no browser: say so rather than fail
	const nav = typeof navigator === 'undefined' ? undefined : navigator;
	const scr = typeof screen === 'undefined' ? undefined : screen;
	return {
		version,
		userAgent: nav?.userAgent ?? 'unknown',
		platform: nav?.platform ?? 'unknown',
		screen: scr ? `${scr.width}x${scr.height}` : 'unknown',
	};
}

const systemLines = (info: SystemInfo) => [
	`Holecraft ${info.version}`,
	`Browser: ${info.userAgent}`,
	`Platform: ${info.platform}`,
	`Screen: ${info.screen}`,
];

/** The text of the new issue: the system, then headings to fill in. */
function issueBody(info: SystemInfo): string {
	return [
		'**What happened?**',
		'',
		'**What did you expect?**',
		'',
		'**Steps to repeat it**',
		'',
		'_Please attach a screenshot if you can: drag it into this box. A page cannot attach one for you._',
		'',
		'---',
		...systemLines(info).map((l) => `- ${l}`),
	].join('\n');
}

/** The address that opens a new issue with the system details filled in. */
export function reportUrl(info: SystemInfo): string {
	const query = new URLSearchParams({ title: '', body: issueBody(info) });
	return `${REPORT_URL}?${query.toString()}`;
}

/** The system and the latest errors as plain text, to paste into an issue. */
export function diagnosticsText(info: SystemInfo, errors: readonly LoggedError[]): string {
	const errorLines = errors.length === 0 ? ['No errors since the page opened'] : errors.map((e) => `${e.at} ${e.message}`);
	return [...systemLines(info), '', 'Recent errors:', ...errorLines].join('\n');
}
