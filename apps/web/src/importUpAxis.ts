import type { UpAxis } from '@holecraft/core';

const KEY = 'holecraft.importUp';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's storage, or nothing when it is blocked or missing: remembering the choice is only a convenience. */
export const browserStorage = (): Store | undefined => {
	try {
		return localStorage;
	} catch {
		return undefined;
	}
};

/** The up axis left set for imports (Z unless it was set to Y). */
export function readUpAxis(storage: Store | undefined): UpAxis {
	try {
		return storage?.getItem(KEY) === 'y' ? 'y' : 'z';
	} catch {
		return 'z';
	}
}

export function writeUpAxis(storage: Store | undefined, up: UpAxis): void {
	try {
		storage?.setItem(KEY, up);
	} catch {
		// remembering is optional
	}
}
