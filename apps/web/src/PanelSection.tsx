import { type ReactNode, useContext } from 'react';
import { SectionFoldingContext } from './usePanelLayout.ts';

/**
 * One section of the side panel: a heading and what is under it. On the desktop panel the heading has an arrow that folds the section away
 * (its contents stay mounted, only hidden, so what was typed in it survives). Clicking the heading itself does nothing, and on a phone's tabs
 * there is no arrow.
 */
export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
	const folding = useContext(SectionFoldingContext);
	const folded = !!folding?.folded.includes(title);
	// an id has no spaces (a title like "Model check" has one)
	const bodyId = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;
	return (
		<section aria-label={title}>
			<div className="section-head">
				<h2>{title}</h2>
				{folding && (
					<button
						type="button"
						className="section-toggle"
						aria-expanded={!folded}
						aria-controls={bodyId}
						aria-label={`${folded ? 'Expand' : 'Collapse'} ${title}`}
						onClick={() => folding.toggle(title)}
					>
						<span aria-hidden="true">{folded ? '▸' : '▾'}</span>
					</button>
				)}
			</div>
			<div id={bodyId} hidden={folded}>
				{children}
			</div>
		</section>
	);
}
