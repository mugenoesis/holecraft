import { useEffect, useState } from 'react';

/** The side panel's tabs in the compact layout: Shapes, Edit (Properties and Arrange), Colours and Objects. */
export type PanelTab = 'shapes' | 'edit' | 'colours' | 'objects';

export const PANEL_TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
	{ id: 'shapes', label: 'Shapes' },
	{ id: 'edit', label: 'Edit' },
	{ id: 'colours', label: 'Colours' },
	{ id: 'objects', label: 'Objects' },
];

/**
 * Which tab to show after the selection changes from `before` to `after` items: selecting something from the
 * Shapes tab brings up its settings, and clearing the selection from Edit goes back to the shapes. Other tabs
 * stay put, since picking several things there (colouring, hiding) is what they are for.
 */
export function tabAfterSelection(tab: PanelTab, before: number, after: number): PanelTab {
	if (tab === 'shapes' && before === 0 && after > 0) return 'edit';
	if (tab === 'edit' && before > 0 && after === 0) return 'shapes';
	return tab;
}

/** The compact layout: phones, folding phones, tablets and narrow windows. Desktop windows keep every panel open at once. */
const COMPACT_QUERY = '(max-width: 900px), (pointer: coarse)';

/** True while the compact layout applies; follows the window as it is resized, or a tablet as it is turned. */
export function useCompactLayout(): boolean {
	const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches);
	useEffect(() => {
		const query = window.matchMedia(COMPACT_QUERY);
		const update = () => setCompact(query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}, []);
	return compact;
}

/** The tab shown in the compact layout, following the selection as `tabAfterSelection` says. */
export function usePanelTab(selected: number): [PanelTab, (tab: PanelTab) => void] {
	const [state, setState] = useState<{ tab: PanelTab; selected: number }>({ tab: 'shapes', selected });
	// Adjusted during render (not in an effect) so the new tab shows in the same frame as the new selection.
	if (state.selected !== selected) setState({ tab: tabAfterSelection(state.tab, state.selected, selected), selected });
	return [state.tab, (tab) => setState((s) => ({ ...s, tab }))];
}
