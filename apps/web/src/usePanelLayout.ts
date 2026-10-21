import { type CSSProperties, createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { browserStorage } from './importUpAxis.ts';
import { clampPanelWidth, DEFAULT_PANEL_WIDTH, parseCollapsed, parsePanelWidth, toggleCollapsed } from './panelLayout.ts';

const WIDTH_KEY = 'holecraft.panelWidth';
const FOLDED_KEY = 'holecraft.foldedSections';

const read = (key: string): string | null => {
	try {
		return browserStorage()?.getItem(key) ?? null;
	} catch {
		return null;
	}
};

const write = (key: string, value: string): void => {
	try {
		browserStorage()?.setItem(key, value);
	} catch {
		// remembering is optional
	}
};

/** What a section of the side panel needs to fold itself away. */
export interface SectionFolding {
	folded: readonly string[];
	toggle: (name: string) => void;
}

/** Given by the editor to the sections of the desktop side panel; without it (a phone's tabs) a section has no fold button. */
export const SectionFoldingContext = createContext<SectionFolding | null>(null);

/**
 * The desktop side panel's width and folded sections, kept in the browser. On a compact layout (touch screens, narrow windows) there is
 * no layout of its own: the panel is tabs there, so no width style and no folding.
 */
export function usePanelLayout(compact: boolean) {
	const [width, setWidthState] = useState(() => parsePanelWidth(read(WIDTH_KEY)));
	const [folded, setFolded] = useState(() => parseCollapsed(read(FOLDED_KEY)));
	useEffect(() => write(WIDTH_KEY, String(width)), [width]);
	useEffect(() => write(FOLDED_KEY, JSON.stringify(folded)), [folded]);

	const setWidth = useCallback((next: number) => setWidthState(clampPanelWidth(next)), []);
	const toggle = useCallback((name: string) => setFolded((current) => toggleCollapsed(current, name)), []);
	const folding = useMemo(() => (compact ? null : { folded, toggle }), [compact, folded, toggle]);
	const style = compact ? undefined : ({ '--panel-width': `${width}px` } as CSSProperties);
	return { compact, width, setWidth, folding, style, resetWidth: () => setWidthState(DEFAULT_PANEL_WIDTH) };
}
