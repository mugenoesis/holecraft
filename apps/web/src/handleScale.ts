const KEY = 'holecraft.handleScale';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const MIN_HANDLE_SCALE = 0.1;
export const MAX_HANDLE_SCALE = 2;
export const DEFAULT_HANDLE_SCALE = 0.5;
export const HANDLE_SCALE_STEP = 0.1;

/** A scale limited to the allowed range and rounded to a hundredth; the default for anything that is not a number. */
export function clampHandleScale(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_HANDLE_SCALE;
	return Math.round(Math.min(MAX_HANDLE_SCALE, Math.max(MIN_HANDLE_SCALE, value)) * 100) / 100;
}

/** The handle scale left set (the default, 50%, when nothing or something damaged is stored). */
export function readHandleScale(storage: Store | undefined): number {
	try {
		const raw = storage?.getItem(KEY);
		return raw ? clampHandleScale(Number(raw)) : DEFAULT_HANDLE_SCALE;
	} catch {
		return DEFAULT_HANDLE_SCALE;
	}
}

export function writeHandleScale(storage: Store | undefined, scale: number): void {
	try {
		storage?.setItem(KEY, String(clampHandleScale(scale)));
	} catch {
		// remembering is optional
	}
}
