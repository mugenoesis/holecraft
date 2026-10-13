const KEY = 'holecraft.rulerSnap';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's storage, or nothing when it is blocked or missing: remembering the choice is only a convenience. */
export const browserStorage = (): Store | undefined => {
	try {
		return localStorage;
	} catch {
		return undefined;
	}
};

/** Whether the ruler snaps to corners and edges: on, unless it was switched off. */
export function readRulerSnap(storage: Store | undefined): boolean {
	try {
		return storage?.getItem(KEY) !== '0';
	} catch {
		return true;
	}
}

export function writeRulerSnap(storage: Store | undefined, on: boolean): void {
	try {
		storage?.setItem(KEY, on ? '1' : '0');
	} catch {
		// remembering is optional
	}
}
