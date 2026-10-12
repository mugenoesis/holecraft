import { CHAMFER_EDGES, type ChamferEdges, chamferOf, countersinkOf, type ShapeNode } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import { NumberField } from './PropertiesPanel.tsx';

const EDGE_LABEL: Record<ChamferEdges, string> = { all: 'All', top: 'Top', bottom: 'Bottom' };
const EDGE_TITLE: Record<ChamferEdges, string> = {
	all: 'Bevel every edge',
	top: 'Bevel only the edges around the top',
	bottom: 'Bevel only the edges around the bottom (no elephant\u2019s foot when printing)',
};

const fmt = (n: number) => String(Number(n.toFixed(2)));

/** A box's or cylinder's chamfer: its size in mm and which edges it is on. Nothing for other shapes. */
export function ChamferFields({ node, dispatch }: { node: ShapeNode; dispatch: Dispatch<EditorAction> }) {
	if (node.shapeType !== 'box' && node.shapeType !== 'cylinder') return null;
	const typed = typeof node.params.chamfer === 'number' ? node.params.chamfer : 0;
	const effective = chamferOf(node);
	return (
		<>
			<NumberField label="Chamfer" value={typed} onCommit={(size) => dispatch({ type: 'setChamfer', id: node.id, size })} />
			{effective && (
				<div className="field">
					<span>Edges</span>
					<div className="segmented compact" role="group" aria-label="Chamfer edges">
						{CHAMFER_EDGES.map((edges) => (
							<button
								key={edges}
								type="button"
								aria-pressed={effective.edges === edges}
								title={EDGE_TITLE[edges]}
								onClick={() => dispatch({ type: 'setChamfer', id: node.id, edges })}
							>
								{EDGE_LABEL[edges]}
							</button>
						))}
					</div>
				</div>
			)}
			{typed > 0 && countersinkOf(node) && (
				<p className="muted hint field-hint" data-testid="chamfer-ignored">
					Not used while this hole has a countersink.
				</p>
			)}
			{effective && effective.size < typed && (
				<p className="muted hint field-hint" data-testid="chamfer-limited">
					Limited to {fmt(effective.size)} mm by the shape\u2019s size.
				</p>
			)}
		</>
	);
}
