import { type Design, hasHiddenNodes, type NodeId, nodeBoundsIn, SHAPE_DEFS, type ShapeType, translationOf } from '@holecraft/core';
import type { Dispatch, DragEvent, KeyboardEvent } from 'react';
import type { EditorAction } from './editorState.ts';
import { SHAPE_DRAG_TYPE } from './shapeDrag.ts';

const fmt = (n: number) => String(Number(n.toFixed(2)));

export function ShapesPanel({ onAddShape }: { onAddShape: (type: ShapeType) => void }) {
	const onDragStart = (e: DragEvent, type: ShapeType) => {
		e.dataTransfer.setData(SHAPE_DRAG_TYPE, type);
		e.dataTransfer.effectAllowed = 'copy';
	};

	const onKeyDown = (e: KeyboardEvent, type: ShapeType) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onAddShape(type);
		}
	};

	return (
		<section aria-label="Shapes">
			<h2>Shapes</h2>
			<p className="muted hint">Drag onto the workplane, or click to add at the centre.</p>
			<div className="shape-grid">
				{SHAPE_DEFS.map((def) => (
					<div
						key={def.id}
						role="button"
						tabIndex={0}
						draggable
						className="shape-tile"
						onClick={() => onAddShape(def.id)}
						onKeyDown={(e) => onKeyDown(e, def.id)}
						onDragStart={(e) => onDragStart(e, def.id)}
					>
						<span className={`swatch ${def.id}`} style={{ backgroundColor: def.color }} aria-hidden="true" />
						{def.name}
					</div>
				))}
			</div>
		</section>
	);
}

interface ObjectListProps {
	design: Design;
	selection: readonly NodeId[];
	onSelect: (id: NodeId, additive: boolean) => void;
	dispatch: Dispatch<EditorAction>;
}

export function ObjectList({ design, selection, onSelect, dispatch }: ObjectListProps) {
	return (
		<section aria-label="Objects">
			<h2>Objects</h2>
			{hasHiddenNodes(design) && (
				<button type="button" className="show-all" onClick={() => dispatch({ type: 'showAll' })} title="Show every hidden object again">
					Show all
				</button>
			)}
			<ul className="object-list" data-testid="object-list">
				{design.roots.map((id) => (
					<ObjectRow key={id} design={design} id={id} selected={selection.includes(id)} onSelect={onSelect} dispatch={dispatch} />
				))}
			</ul>
			{design.roots.length === 0 && <p className="muted">Nothing here yet.</p>}
		</section>
	);
}

/** A small on/off button at the end of an Objects row (lock, hide). */
function RowToggle({ on, label, glyph, onClick }: { on: boolean; label: string; glyph: string; onClick: () => void }) {
	return (
		<button type="button" className="row-toggle" aria-pressed={on} aria-label={label} title={label} onClick={onClick}>
			<span aria-hidden="true">{glyph}</span>
		</button>
	);
}

interface ObjectRowProps {
	design: Design;
	id: NodeId;
	selected: boolean;
	onSelect: (id: NodeId, additive: boolean) => void;
	dispatch: Dispatch<EditorAction>;
}

function ObjectRow({ design, id, selected, onSelect, dispatch }: ObjectRowProps) {
	const node = design.nodes[id];
	if (!node) return null;
	// A shape is listed by its base point; a group by the middle of what it holds.
	const bounds = node.kind === 'group' ? nodeBoundsIn(design, id) : null;
	const [x, y] = bounds ? [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2] : translationOf(node.transform);
	return (
		<li
			data-selected={selected}
			data-color={node.color}
			data-mode={node.mode}
			data-kind={node.kind}
			data-hidden={node.hidden}
			data-locked={node.locked}
		>
			<button type="button" className={selected ? 'selected' : undefined} onClick={(e) => onSelect(id, e.shiftKey)}>
				<span
					className={`dot ${node.mode}`}
					style={node.mode === 'hole' ? { borderColor: node.color } : { background: node.color }}
					aria-hidden="true"
				/>
				<span className="object-name">
					{node.name} ({fmt(x)}, {fmt(y)})
				</span>
			</button>
			<RowToggle
				on={node.locked}
				label={node.locked ? 'Unlock' : 'Lock'}
				glyph={node.locked ? '🔒' : '🔓'}
				onClick={() => dispatch({ type: 'setLocked', ids: [id], locked: !node.locked })}
			/>
			<RowToggle
				on={node.hidden}
				label={node.hidden ? 'Show' : 'Hide'}
				glyph={node.hidden ? '🚫' : '👁'}
				onClick={() => dispatch({ type: 'setHidden', ids: [id], hidden: !node.hidden })}
			/>
		</li>
	);
}
