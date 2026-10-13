import { getShapeDef, isShapeType, type ParamDef, type ShapeNode, shapeParam, shapeParamMm, typedParamMm } from '@holecraft/core';
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
				if (p.choices) return <ChoiceField key={p.key} node={node} setting={p} dispatch={dispatch} />;
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
								{p.count ? `Limited to ${fmt(used)} sides.` : `Limited to ${fmt(used)} mm by the shape’s size.`}
							</p>
						)}
					</div>
				);
			})}
		</>
	);
}

const option = (c: { value: number; label: string }) => (
	<option key={c.value} value={c.value}>
		{c.label}
	</option>
);

/** The choices in the order given, split into the groups they name (a choice with no group is on its own, with an empty name). */
export function choiceGroups(setting: ParamDef): [string, { value: number; label: string }[]][] {
	const groups = new Map<string, { value: number; label: string }[]>();
	for (const c of setting.choices ?? []) {
		const name = c.group ?? '';
		groups.set(name, [...(groups.get(name) ?? []), c]);
	}
	return [...groups];
}

/** A setting picked from a list (a thread's Size, a threaded hole's Fit): a dropdown that stores the value picked. */
function ChoiceField({ node, setting, dispatch }: { node: ShapeNode; setting: ParamDef; dispatch: Dispatch<EditorAction> }) {
	return (
		<label className="field">
			<span>{setting.label}</span>
			<select
				aria-label={setting.label}
				value={shapeParam(node, setting.key)}
				onChange={(e) => dispatch({ type: 'setShapeParam', id: node.id, key: setting.key, value: Number(e.target.value) })}
			>
				{choiceGroups(setting).map(([group, choices]) =>
					group ? (
						<optgroup key={group} label={group}>
							{choices.map(option)}
						</optgroup>
					) : (
						choices.map(option)
					),
				)}
			</select>
		</label>
	);
}
