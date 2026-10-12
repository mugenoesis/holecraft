import { getShapeDef, isShapeType, type ShapeNode, shapeParam } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import { NumberField } from './PropertiesPanel.tsx';

const fmt = (n: number) => String(Number(n.toFixed(2)));

/**
 * A field for each setting the shape declares besides its size (a tube's wall, a ring's thickness), in mm. A value too big for the
 * shape's size is used as the most that fits, and says so; what was typed is kept, so growing the shape again gives it back.
 */
export function ShapeParamFields({ node, dispatch }: { node: ShapeNode; dispatch: Dispatch<EditorAction> }) {
	const settings = isShapeType(node.shapeType) ? getShapeDef(node.shapeType).params : undefined;
	if (!settings) return null;
	return (
		<>
			{settings.map((p) => {
				const typed = typeof node.params[p.key] === 'number' ? Number(node.params[p.key]) : p.default;
				const used = shapeParam(node, p.key);
				return (
					<div key={p.key} className="param-field">
						<NumberField
							label={p.label}
							value={typed}
							onCommit={(value) => dispatch({ type: 'setShapeParam', id: node.id, key: p.key, value })}
						/>
						{used < typed && (
							<p className="muted hint field-hint" data-testid="param-limited">
								Limited to {fmt(used)} mm by the shape’s size.
							</p>
						)}
					</div>
				);
			})}
		</>
	);
}
