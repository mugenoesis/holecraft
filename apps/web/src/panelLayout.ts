/*
 * The desktop side panel's own layout: how wide it is (dragged by its edge, or with the arrow keys on it) and which sections are folded
 * away. Both are only conveniences kept in the browser, never in a design. The rules are here, pure, so they are tested without a screen.
 */

export const DEFAULT_PANEL_WIDTH = 260;
export const MIN_PANEL_WIDTH = 220;
export const MAX_PANEL_WIDTH = 560;
const STEP = 16;
const BIG_STEP = 64;

/** A panel width kept between the least and the most (and never over half of a narrow window, so the view keeps its room). */
export function clampPanelWidth(width: number, windowWidth?: number): number {
	if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH;
	const most =
		windowWidth === undefined ? MAX_PANEL_WIDTH : Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.floor(windowWidth / 2)));
	return Math.min(most, Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

/** The width kept in storage, or the usual one when there is none or it is not a sensible number. */
export function parsePanelWidth(raw: string | null): number {
	const n = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
	return Number.isFinite(n) && n > 0 ? clampPanelWidth(n) : DEFAULT_PANEL_WIDTH;
}

/** The width when the pointer is at `x`: the panel is what is right of it. */
export const widthFromPointer = (x: number, windowWidth: number): number => clampPanelWidth(windowWidth - x, windowWidth);

/** The width after a key on the edge: Left makes it wider, Right narrower (Shift for bigger steps), Home the usual width, End the widest. */
export function nudgedWidth(width: number, key: string, big = false): number | null {
	const step = big ? BIG_STEP : STEP;
	if (key === 'ArrowLeft') return clampPanelWidth(width + step);
	if (key === 'ArrowRight') return clampPanelWidth(width - step);
	if (key === 'Home') return DEFAULT_PANEL_WIDTH;
	if (key === 'End') return MAX_PANEL_WIDTH;
	return null;
}

/** The names of the folded sections kept in storage: only text, each once. */
export function parseCollapsed(raw: string | null): string[] {
	try {
		const value: unknown = JSON.parse(raw ?? '');
		return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))] : [];
	} catch {
		return [];
	}
}

/** The folded sections after one is folded or opened. */
export const toggleCollapsed = (collapsed: readonly string[], name: string): string[] =>
	collapsed.includes(name) ? collapsed.filter((n) => n !== name) : [...collapsed, name];

/** The sections folded when the panel is first seen: Resin, which only matters when printing with resin. A saved choice wins, even an empty one. */
export function initialFolded(raw: string | null): string[] {
	try {
		JSON.parse(raw ?? '');
	} catch {
		return ['Resin'];
	}
	return parseCollapsed(raw);
}
