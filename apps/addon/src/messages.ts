import type { CaughtView } from './caught.ts';
import type { Diagnostics } from './diagnostics.ts';
import type { RecentEntry } from './recent.ts';
import type { Settings } from './settings.ts';

/** Where a file can be sent. */
export type Target = 'holecraft' | 'trident';

/** What the popup and the options page ask the background page to do. */
export type Request =
	| { type: 'state' }
	| { type: 'zipModels'; id: string }
	/** `entry` is the model to take out of a zip (for Trident); a zip goes to Holecraft whole. */
	| { type: 'send'; id: string; to: Target; entry?: string }
	| { type: 'dismiss'; id: string }
	| { type: 'getSettings' }
	| { type: 'saveSettings'; settings: Settings }
	| { type: 'test'; target: Target }
	| { type: 'recent' }
	| { type: 'clearRecent' }
	| { type: 'diagnostics' };

/** The answer: the data, or what went wrong in words fit to show. */
export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export interface State {
	files: CaughtView[];
	holecraftReady: boolean;
	tridentReady: boolean;
}

export type { Diagnostics, RecentEntry, Settings };
