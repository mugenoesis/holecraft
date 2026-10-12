import { getShapeDef, isShapeType, type ShapeNode, shapeParamMm, typedParamMm } from '@holecraft/core';
import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import { NumberField } from './PropertiesPanel.tsx';

const fmt = (n: number) => String(Number(n.toFixed(2)));

/**
 * A field for each setting the shape declares besides its size (a tube's wall, a ring's thickness), in mm for the shape as it is now. The
 * setting is kept as a share of the shape, so resizing the shape stretches it evenly and the field follows. A value too big for the shape is
 * used as the most that fits, and says so; what was typed is kept, so growing the shape again gives it back.
 */
export function ShapeParamFields({ node, dispatch }: { node: ShapeNode; dispatch: Dispatch<EditorAction> }) {
	const settings = isShapeType(node.shapeType) ? getShapeDef(node.shapeType).params : undefined;
	if (!settings) return null;
	return (
		<>
			{settings.map((p) => {
				const typed = typedParamMm(node, p.key);
				const used = shapeParamMm(node, p.key);
				return (
					<div key={p.key} className="param-field">
						<NumberField
							label={p.label}
							value={typed}
							onCommit={(value) => dispatch({ type: 'setShapeParam', id: node.id, key: p.key, value })}
						/>
						{used < typed - 1e-9 && (
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
