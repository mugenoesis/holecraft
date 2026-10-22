import { type Design, MAX_WORKPLANE_MM, MIN_WORKPLANE_MM } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import { PanelSection } from './PanelSection.tsx';
import { NumberField } from './PropertiesPanel.tsx';

/** The size of the workplane (the build plate the design stands on), in mm: a number typed outside the limits is brought back to the nearest one. */
export function WorkplanePanel({ design, dispatch }: { design: Design; dispatch: Dispatch<EditorAction> }) {
	const [width, depth] = design.grid.size;
	return (
		<PanelSection title="Workplane">
			<div className="fields">
				<NumberField label="Width" value={width} onCommit={(v) => dispatch({ type: 'setWorkplane', width: v, depth })} />
				<NumberField label="Depth" value={depth} onCommit={(v) => dispatch({ type: 'setWorkplane', width, depth: v })} />
			</div>
			<p className="muted hint">
				The size of the build plate in mm, from {MIN_WORKPLANE_MM} mm up to {MAX_WORKPLANE_MM} mm ({MAX_WORKPLANE_MM / 10} cm). Shapes
				outside a smaller plate stay where they are.
			</p>
		</PanelSection>
	);
}
