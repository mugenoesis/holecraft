import {
	getShapeDef,
	isShapeType,
	type ParamDef,
	type ShapeNode,
	shapeParam,
	shapeParamMm,
	textOf,
	typedParamMm,
	wrapOf,
} from '@holecraft/core';

import type { Dispatch } from 'react';
import type { EditorAction } from './editorState.ts';
import { chooseFont } from './fontChoice.ts';
import { NumberField, TextField } from './PropertiesPanel.tsx';

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
			{node.shapeType === 'text' && (
				<TextField label="Text" value={textOf(node)} onCommit={(text) => dispatch({ type: 'setShapeText', id: node.id, text })} />
			)}
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
			{node.shapeType === 'text' && <WrapField node={node} dispatch={dispatch} />}
		</>
	);
}

/** Where the text goes round a cylinder: its radius in mm, 0 for flat, negative for the inside. A radius the words cannot go round is raised, and it says so. */
function WrapField({ node, dispatch }: { node: ShapeNode; dispatch: Dispatch<EditorAction> }) {
	const typed = Number.isFinite(Number(node.params.wrap)) ? Number(node.params.wrap) : 0;
	const used = wrapOf(node);
	return (
		<div className="param-field">
			<NumberField label="Wrap radius" value={typed} onCommit={(radius) => dispatch({ type: 'setTextWrap', id: node.id, radius })} />
			<p className="muted hint field-hint">
				0 is flat. A radius bends the words round the outside of a cylinder that size; a negative one round the inside. There are no resize
				handles while it is bent.
			</p>
			{Math.abs(used) > Math.abs(typed) + 1e-9 && (
				<p className="muted hint field-hint" data-testid="param-limited">
					Raised to {fmt(Math.abs(used))} mm: the words are too long to go that far round.
				</p>
			)}
		</div>
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
				onChange={(e) => {
					const value = Number(e.target.value);
					const apply = () => dispatch({ type: 'setShapeParam', id: node.id, key: setting.key, value });
					// a font has to be loaded before the words can be measured in it
					if (setting.key === 'font') void chooseFont(value, apply);
					else apply();
				}}
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
