import { COUNTERSINK_ENDS, type CountersinkEnd, countersinkOf, type ShapeNode } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import { NumberField } from './PropertiesPanel.tsx';

const END_LABEL: Record<CountersinkEnd, string> = { top: 'Top', bottom: 'Bottom', both: 'Both' };
const END_TITLE: Record<CountersinkEnd, string> = {
	top: 'Flare the opening at the top of the hole',
	bottom: 'Flare the opening at the bottom of the hole',
	both: 'Flare both ends of the hole',
};

const fmt = (n: number) => String(Number(n.toFixed(2)));

/**
 * A cylinder hole's countersink: how far its opening widens on every side (mm, a 45 degree flare, so a screw head sits flush)
 * and which end. Nothing for other shapes, or for a cylinder that isn't a hole.
 */
export function CountersinkFields({ node, dispatch }: { node: ShapeNode; dispatch: Dispatch<EditorAction> }) {
	if (node.shapeType !== 'cylinder' || node.mode !== 'hole') return null;
	const typed = typeof node.params.countersink === 'number' ? node.params.countersink : 0;
	const effective = countersinkOf(node);
	return (
		<>
			<NumberField label="Countersink" value={typed} onCommit={(size) => dispatch({ type: 'setCountersink', id: node.id, size })} />
			{effective && (
				<div className="field">
					<span>End</span>
					<div className="segmented compact" role="group" aria-label="Countersink end">
						{COUNTERSINK_ENDS.map((end) => (
							<button
								key={end}
								type="button"
								aria-pressed={effective.end === end}
								title={END_TITLE[end]}
								onClick={() => dispatch({ type: 'setCountersink', id: node.id, end })}
							>
								{END_LABEL[end]}
							</button>
						))}
					</div>
				</div>
			)}
			{effective && effective.size < typed && (
				<p className="muted hint field-hint" data-testid="countersink-limited">
					Limited to {fmt(effective.size)} mm by the hole’s length.
				</p>
			)}
		</>
	);
}
