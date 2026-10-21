import { type DesignOrder, type DesignSummary, filterDesigns, folderKey, groupByFolder, sortDesigns } from '@holecraft/core';
import { useEffect, useMemo, useState } from 'react';
import { browserStorage } from './importUpAxis.ts';
import { parseCollapsed, toggleCollapsed } from './panelLayout.ts';

const ORDER_KEY = 'holecraft.designOrder';
const FOLDED_KEY = 'holecraft.foldedFolders';
const ORDERS: readonly DesignOrder[] = ['updated', 'name', 'created'];

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

/** The order kept in the browser, or the usual one (most recently changed first). */
export const parseOrder = (raw: string | null): DesignOrder => ORDERS.find((o) => o === raw) ?? 'updated';

/**
 * What the designs list shows: the designs matching the search, in the chosen order, in groups by folder. The order and which folders are folded
 * are kept in the browser. A search shows every folder that has a match, even a folded one, and a folded folder folds back when it is cleared.
 */
export function useDesignsView(designs: readonly DesignSummary[]) {
	const [query, setQuery] = useState('');
	const [order, setOrder] = useState<DesignOrder>(() => parseOrder(read(ORDER_KEY)));
	const [folded, setFolded] = useState<string[]>(() => parseCollapsed(read(FOLDED_KEY)));
	useEffect(() => write(ORDER_KEY, order), [order]);
	useEffect(() => write(FOLDED_KEY, JSON.stringify(folded)), [folded]);

	const searching = query.trim() !== '';
	const groups = useMemo(() => groupByFolder(sortDesigns(filterDesigns(designs, query), order)), [designs, query, order]);
	const isOpen = (folder: string) => searching || !folded.includes(folderKey(folder));
	const toggleFolder = (folder: string) => setFolded((current) => toggleCollapsed(current, folderKey(folder)));
	return { query, setQuery, order, setOrder, groups, searching, isOpen, toggleFolder };
}
