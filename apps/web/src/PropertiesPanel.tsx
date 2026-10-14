import {
	canResizeGroup,
	type Design,
	type DesignNode,
	descendantIds,
	eulerOfTransform,
	groupGeometry,
	isThreadedType,
	lengthOffset,
	type NodeId,
	type ShapeNode,
	translationOf,
} from '@holecraft/core';
import type { Dispatch } from 'react';
import { ChamferFields } from './ChamferFields.tsx';
import { ColourField, useColourEdit } from './ColourField.tsx';
import { CountersinkFields } from './CountersinkFields.tsx';
import type { EditorAction } from './editorState.ts';
import { SaveToLibrary } from './SaveToLibrary.tsx';
import { ShapeParamFields } from './ShapeParamFields.tsx';
import { useDraft } from './useDraft.ts';
import type { Library } from './useLibrary.ts';

/** Why a group's size fields are switched off. */
function whyNotResizable(design: Design, id: NodeId): string {
	const thread = descendantIds(design, id).some((c) => {
		const n = design.nodes[c];
		return n?.kind === 'shape' && isThreadedType(n.shapeType);
	});
	return thread
		? 'It holds a thread, nut, washer or standoff, which keeps its real size, so the group cannot be resized.'
		: 'Resizing needs every shape inside turned in quarter turns (0, 90, 180, 270 degrees).';
}

const fmt = (n: number) => String(Number(n.toFixed(2)));

interface Props {
	design: Design;
	selection: readonly NodeId[];
	dispatch: Dispatch<EditorAction>;
	/** Keeps the selected shape or group in the library of saved shapes. */
	library: Library;
	/** Takes the sketch shape back into the Sketch tool to redraw it. */
	onEditSketch?: (id: NodeId) => void;
}

/** The settings a kind of shape has besides its size (each shows only for the shapes it belongs to). */
function ShapeSettings({
	node,
	dispatch,
	onEditSketch,
}: {
	node: ShapeNode;
	dispatch: Dispatch<EditorAction>;
	onEditSketch: ((id: NodeId) => void) | undefined;
}) {
	return (
		<>
			<ChamferFields node={node} dispatch={dispatch} />
			<CountersinkFields node={node} dispatch={dispatch} />
			<ShapeParamFields node={node} dispatch={dispatch} />
			<EditSketchButton node={node} onEdit={onEditSketch} />
		</>
	);
}

/** Edit sketch: for a sketch shape only, and off while it is locked. */
function EditSketchButton({ node, onEdit }: { node: ShapeNode; onEdit: ((id: NodeId) => void) | undefined }) {
	if (node.shapeType !== 'sketch' || !onEdit) return null;
	return (
		<div className="button-row">
			<button
				type="button"
				className="primary"
				disabled={node.locked}
				onClick={() => onEdit(node.id)}
				title="Go back into the drawing tools to change this sketch"
			>
				Edit sketch
			</button>
		</div>
	);
}

/** Save to library, for one shape or group at a time (group several first); a different selection starts the box afresh. */
function SaveBox({ design, nodes, library }: { design: Design; nodes: readonly DesignNode[]; library: Library }) {
	const target = nodes.length === 1 ? nodes[0] : undefined;
	if (!target || target.kind === 'mesh') return null;
	return (
		<SaveToLibrary
			key={target.id}
			defaultName={target.name}
			problem={library.problem}
			onSave={(name) => library.save(design, target.id, name)}
		/>
	);
}

/** The selected shapes' colour: the wheel previews on them as it is dragged, and the design's own colours come first. */
function ShapeColour({ design, ids, value, dispatch }: { design: Design; ids: NodeId[]; value: string; dispatch: Dispatch<EditorAction> }) {
	const events = useColourEdit(
		dispatch,
		(color) => ({ type: 'previewColor', ids, color }),
		(color) => ({ type: 'setColor', ids, color }),
	);
	return <ColourField label="Color" inputLabel="Color" value={value} designColours={design.palette} {...events} />;
}

export function PropertiesPanel({ design, selection, dispatch, library, onEditSketch }: Props) {
	const nodes = selection.flatMap((id) => (design.nodes[id] ? [design.nodes[id]] : []));

	if (nodes.length === 0) {
		return (
			<section aria-label="Properties">
				<h2>Properties</h2>
				<p className="muted">Select a shape to edit its properties.</p>
			</section>
		);
	}

	const actions = (
		<div className="button-row">
			<button type="button" onClick={() => dispatch({ type: 'duplicate' })} title="Duplicate (Ctrl+D)">
				Duplicate
			</button>
			<button type="button" onClick={() => dispatch({ type: 'dropToPlane' })} title="Drop to workplane (D)">
				Drop to workplane
			</button>
			<button type="button" onClick={() => dispatch({ type: 'delete' })} title="Delete (Delete)">
				Delete
			</button>
		</div>
	);
	const saveBox = <SaveBox design={design} nodes={nodes} library={library} />;

	const color = <ShapeColour design={design} ids={nodes.map((n) => n.id)} value={nodes[0]!.color} dispatch={dispatch} />;

	// Solid or hole. Neither button is pressed when the selection is a mix.
	const modes = new Set(nodes.map((n) => n.mode));
	const typeToggle = (
		<div className="field">
			<span>Type</span>
			<div className="segmented" role="group" aria-label="Type">
				{(['solid', 'hole'] as const).map((mode) => (
					<button
						key={mode}
						type="button"
						aria-pressed={modes.size === 1 && modes.has(mode)}
						onClick={() => dispatch({ type: 'setMode', mode })}
						title={mode === 'hole' ? 'Cut this shape out of anything it overlaps in its group' : 'Add this shape to the model'}
					>
						{mode === 'solid' ? 'Solid' : 'Hole'}
					</button>
				))}
			</div>
		</div>
	);

	const only = nodes.length === 1 ? nodes[0]! : null;

	if (!only) {
		return (
			<section aria-label="Properties">
				<h2>Properties</h2>
				<p>{nodes.length} shapes selected</p>
				{typeToggle}
				{color}
				{actions}
				{saveBox}
			</section>
		);
	}

	if (only.kind === 'group') {
		const shapes = descendantIds(design, only.id).filter((id) => design.nodes[id]?.kind === 'shape').length;
		const groupEuler = eulerOfTransform(only.transform);
		// the box around what it holds (null while it is tipped over): typing a size stretches everything inside, as dragging a handle does
		const box = groupGeometry(design, only.id);
		const resizable = canResizeGroup(design, only.id);
		return (
			<section aria-label="Properties">
				<h2>Properties</h2>
				<div key={only.id} className="fields">
					<TextField label="Name" value={only.name} onCommit={(name) => dispatch({ type: 'rename', id: only.id, name })} />
					{(['X', 'Y', 'Z'] as const).map((axis, i) => (
						<NumberField
							key={axis}
							label={`Rotate ${axis}`}
							value={groupEuler[i]!}
							onCommit={(v) =>
								dispatch({ type: 'setEuler', id: only.id, euler: groupEuler.map((e, k) => (k === i ? v : e)) as [number, number, number] })
							}
						/>
					))}
					{box &&
						(['width', 'depth', 'height'] as const).map((key) => (
							<NumberField
								key={key}
								label={key[0]!.toUpperCase() + key.slice(1)}
								value={box[key]}
								disabled={!resizable}
								onCommit={(v) => dispatch({ type: 'setGroupSize', id: only.id, size: { [key]: v } })}
							/>
						))}
				</div>
				{box && !resizable && <p className="muted hint">{whyNotResizable(design, only.id)}</p>}
				<p>Contains {shapes} shapes</p>
				{typeToggle}
				{color}
				{actions}
				{saveBox}
			</section>
		);
	}

	const [x, y, z] = translationOf(only.transform);
	const euler = eulerOfTransform(only.transform);
	const turn = (axis: 0 | 1 | 2) => (v: number) => {
		const next: [number, number, number] = [...euler];
		next[axis] = v;
		dispatch({ type: 'setEuler', id: only.id, euler: next });
	};
	// a thread keeps its real width and depth (from its Size and Fit): only its length can change
	const fixed = only.kind === 'shape' && isThreadedType(only.shapeType);
	// a bolt's Length is its shank: the head is on top of it, so its height is more
	const offset = only.kind === 'shape' ? lengthOffset(only.shapeType, only.params) : 0;
	const size = only.kind === 'shape' ? (only.params as { width: number; depth: number; height: number }) : null;

	return (
		<section aria-label="Properties">
			<h2>Properties</h2>
			{/* Keyed by id so half-typed values never leak from one shape to another. */}
			<div key={only.id} className="fields">
				<TextField label="Name" value={only.name} onCommit={(name) => dispatch({ type: 'rename', id: only.id, name })} />
				<NumberField label="X" value={x} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [v, y] })} />
				<NumberField label="Y" value={y} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [x, v] })} />
				<NumberField label="Z" value={z} onCommit={(v) => dispatch({ type: 'setPosition', id: only.id, at: [x, y, v] })} />
				{size && (
					<>
						<NumberField
							label="Width"
							disabled={fixed}
							value={size.width}
							onCommit={(width) => dispatch({ type: 'setSize', id: only.id, size: { width } })}
						/>
						<NumberField
							label="Depth"
							disabled={fixed}
							value={size.depth}
							onCommit={(depth) => dispatch({ type: 'setSize', id: only.id, size: { depth } })}
						/>
						<NumberField
							label={fixed ? 'Length' : 'Height'}
							value={size.height - offset}
							onCommit={(length) => dispatch({ type: 'setSize', id: only.id, size: { height: length + offset } })}
						/>
					</>
				)}
				<NumberField label="Rotate X" value={euler[0]} onCommit={turn(0)} />
				<NumberField label="Rotate Y" value={euler[1]} onCommit={turn(1)} />
				<NumberField label="Rotate Z" value={euler[2]} onCommit={turn(2)} />
				{only.kind === 'shape' && <ShapeSettings node={only} dispatch={dispatch} onEditSketch={onEditSketch} />}
				{typeToggle}
				{color}
			</div>
			{actions}
			{saveBox}
		</section>
	);
}

export function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
	const d = useDraft(value, onCommit);
	return (
		<label className="field">
			<span>{label}</span>
			<input
				type="text"
				aria-label={label}
				value={d.value}
				onChange={(e) => d.onChange(e.target.value)}
				onBlur={d.onBlur}
				onKeyDown={d.onKeyDown}
			/>
		</label>
	);
}

export function NumberField({
	label,
	value,
	onCommit,
	disabled,
}: {
	label: string;
	value: number;
	onCommit: (v: number) => void;
	disabled?: boolean;
}) {
	const d = useDraft(fmt(value), (draft) => {
		const n = draft.trim() === '' ? Number.NaN : Number(draft);
		if (Number.isFinite(n)) onCommit(n);
	});
	return (
		<label className="field">
			<span>{label}</span>
			<input
				type="number"
				step="any"
				disabled={disabled}
				value={d.value}
				onChange={(e) => d.onChange(e.target.value)}
				onBlur={d.onBlur}
				onKeyDown={d.onKeyDown}
			/>
		</label>
	);
}
