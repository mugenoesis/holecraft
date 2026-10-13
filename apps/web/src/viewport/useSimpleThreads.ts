import { useCallback, useState } from 'react';

const KEY = 'holecraft.simpleThreads';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage = (): Store | undefined => {
	try {
		return localStorage;
	} catch {
		return undefined; // storage can be blocked or missing: remembering is only a convenience
	}
};

/** Whether the switch was left on, off if it never was or storage is not available. */
export function readSimpleThreads(storage: Store | undefined): boolean {
	try {
		return storage?.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export function writeSimpleThreads(storage: Store | undefined, on: boolean): void {
	try {
		storage?.setItem(KEY, on ? '1' : '0');
	} catch {
		// remembering is optional
	}
}

/** Whether threads are drawn as plain cylinders while editing, remembered in this browser (it is a way of looking, not part of the design). */
export function useSimpleThreads(): [boolean, () => void] {
	const [simple, setSimple] = useState(() => readSimpleThreads(browserStorage()));
	const toggle = useCallback(() => {
		setSimple((now) => {
			writeSimpleThreads(browserStorage(), !now);
			return !now;
		});
	}, []);
	return [simple, toggle];
}
