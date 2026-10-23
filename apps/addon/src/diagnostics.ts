/** One thing the add-on checked about the browser it is in. `required` ones stop it working if they are missing. */
interface DiagnosticLine {
	label: string;
	ok: boolean;
	detail: string;
	required?: boolean;
}

export interface Diagnostics {
	lines: DiagnosticLine[];
}

type Loose = Record<string, unknown> | undefined;

/** What the add-on can do in this browser: the pieces of the WebExtension API it uses, and the browser's own name. A different Firefox (desktop, Android) may lack some. */
export function diagnose(env: { browser: Record<string, unknown>; userAgent: string }): Diagnostics {
	const b = env.browser;
	const webRequest = b.webRequest as Loose;
	const has = (object: Loose, name: string) => typeof object?.[name] !== 'undefined';
	const manifest = (b.runtime as { getManifest?: () => { version?: string } } | undefined)?.getManifest?.();
	const ua = /(Firefox\/[\d.]+)/.exec(env.userAgent)?.[1] ?? env.userAgent;
	const android = /Android/.test(env.userAgent) ? ' on Android' : '';
	return {
		lines: [
			{ label: 'Browser', ok: true, detail: `${ua}${android}` },
			{ label: 'Add-on version', ok: true, detail: manifest?.version ?? 'unknown' },
			{
				label: 'Watch downloads',
				ok: has(webRequest, 'onHeadersReceived'),
				detail: 'Needed to notice a model or zip coming down on MakerWorld, Printables or Thingiverse',
				required: true,
			},
			{
				label: 'Copy a download as it comes down',
				ok: has(webRequest, 'filterResponseData'),
				detail:
					'Without it the add-on keeps only the file’s address and fetches the file again when you send it (a link that works only once may then fail)',
				required: false,
			},
			{
				label: 'Banner on the page',
				ok: has(b.tabs as Loose, 'executeScript') && has(b.tabs as Loose, 'sendMessage'),
				detail: 'Lets a banner with the buttons appear on the page a file came down in',
				required: false,
			},
			{
				label: 'Notifications',
				ok: has(b.notifications as Loose, 'create'),
				detail: 'Lets the browser tell you a file was caught (turn it on in the settings)',
				required: false,
			},
			{
				label: 'Open a tab',
				ok: has(b.tabs as Loose, 'create'),
				detail: 'Needed to open Holecraft or Trident after sending',
				required: true,
			},
			{
				label: 'Toolbar button',
				ok: has(b.browserAction as Loose, 'setBadgeText'),
				detail: 'Shows how many files are waiting',
				required: true,
			},
			{
				label: 'Settings storage',
				ok: has(b.storage as Loose, 'local'),
				detail: 'Keeps the addresses and the Trident key on this device',
				required: true,
			},
		],
	};
}
