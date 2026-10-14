import { PANEL_TABS, type PanelTab } from './compactLayout.ts';

/** The tabs over the side panel in the compact layout. Edit shows how many things are selected. */
export function PanelTabs({ tab, onTab, selected }: { tab: PanelTab; onTab: (tab: PanelTab) => void; selected: number }) {
	return (
		<div className="panel-tabs" role="tablist" aria-label="Panels">
			{PANEL_TABS.map((t) => (
				<button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}>
					{t.label}
					{t.id === 'edit' && selected > 0 && (
						<span className="panel-tab-count" aria-hidden="true">
							{selected}
						</span>
					)}
				</button>
			))}
		</div>
	);
}
