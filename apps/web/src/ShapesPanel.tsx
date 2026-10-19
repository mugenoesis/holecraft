import {
	type Design,
	filterShapes,
	hasHiddenNodes,
	type LibrarySummary,
	type NodeId,
	nodeBoundsIn,
	SHAPE_CATEGORIES,
	type ShapeCategory,
	type ShapeType,
	translationOf,
} from '@holecraft/core';
import { type Dispatch, type DragEvent, type KeyboardEvent, useRef, useState } from 'react';
import type { EditorAction } from './editorState.ts';
import { type Placing, placingHint, samePlacing } from './placing.ts';
import { matchingSaved, SavedShapes } from './SavedShapes.tsx';
import { SHAPE_DRAG_TYPE } from './shapeDrag.ts';
import { armsOnClick } from './viewport/placement.ts';

const fmt = (n: number) => String(Number(n.toFixed(2)));

const armedShape = (placing: Placing | null, type: ShapeType) => samePlacing({ kind: 'shape', type }, placing);

/** The saved shapes (the library) the panel shows under Mine, and what to do with them. */
interface SavedShapesProps {
	items: readonly LibrarySummary[];
	onAdd: (id: string) => void;
	/** A mouse click on a tile: arm the saved shape to be put down with the next click on the plate (or let go of it). */
	onArm: (item: LibrarySummary) => void;
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
}

interface ShapesPanelProps {
	/** Adds a shape at once, where a new shape goes (a tap on a touch screen, Enter on a tile). */
	onAddShape: (type: ShapeType) => void;
	/** A mouse click on a tile arms its shape to be put down with the next click on the plate; null lets go of it. */
	onArm: (placing: Placing | null) => void;
	/** What is armed now. */
	placing: Placing | null;
	/** A touch screen: the line under the heading says a tap adds a shape. */
	touch: boolean;
	saved: SavedShapesProps;
}

export function ShapesPanel({ onAddShape, onArm, placing, touch, saved }: ShapesPanelProps) {
	// What pressed a tile, read by its click (which cannot tell a mouse from a finger or the keyboard): only a mouse or a pen arms the shape.
	const pointer = useRef('');
	// a search and a category narrow what is shown; nothing about them is saved
	const [query, setQuery] = useState('');
	const [category, setCategory] = useState<ShapeCategory | 'all' | 'mine'>('all');
	const shapes = category === 'mine' ? [] : filterShapes(query, category);

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
			<input
				type="search"
				className="shape-search"
				aria-label="Search shapes"
				placeholder="Search shapes"
				title="Find a shape by name (Enter adds the first one, Esc clears)"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') setQuery('');
					if (e.key === 'Enter' && shapes[0]) onAddShape(shapes[0].id);
					if (e.key === 'Enter' && category === 'mine' && matchingSaved(saved.items, query)[0])
						saved.onAdd(matchingSaved(saved.items, query)[0]!.id);
				}}
			/>
			<div className="shape-chips" role="group" aria-label="Categories">
				{[{ id: 'all' as const, label: 'All' }, ...SHAPE_CATEGORIES, { id: 'mine' as const, label: 'Mine' }].map((c) => (
					<button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
						{c.label}
					</button>
				))}
			</div>
			<p className="muted hint">{placingHint(placing, touch)}</p>
			{category === 'mine' ? (
				<SavedShapes
					items={saved.items}
					query={query}
					placingId={placing?.kind === 'saved' ? placing.id : null}
					onAdd={saved.onAdd}
					onArm={saved.onArm}
					onRename={saved.onRename}
					onDelete={saved.onDelete}
				/>
			) : (
				<>
					{shapes.length === 0 && (
						<p className="muted" role="status">
							No shape matches “{query.trim()}”
						</p>
					)}
					<div className="shape-grid">
						{shapes.map((def) => (
							<div
								key={def.id}
								role="button"
								tabIndex={0}
								draggable
								aria-pressed={armedShape(placing, def.id)}
								className={armedShape(placing, def.id) ? 'shape-tile armed' : 'shape-tile'}
								onPointerDown={(e) => {
									pointer.current = e.pointerType;
								}}
								onClick={() => {
									const by = pointer.current;
									pointer.current = '';
									if (!armsOnClick(by)) onAddShape(def.id);
									else onArm(armedShape(placing, def.id) ? null : { kind: 'shape', type: def.id });
								}}
								onKeyDown={(e) => onKeyDown(e, def.id)}
								onDragStart={(e) => onDragStart(e, def.id)}
							>
								<span className={`swatch ${def.id}`} style={{ backgroundColor: def.color }} aria-hidden="true" />
								{def.name}
							</div>
						))}
					</div>
				</>
			)}
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
			{design.roots.length > 1 && (
				<button type="button" className="show-all" onClick={() => dispatch({ type: 'selectAll' })} title="Select every object (Ctrl+A)">
					Select all
				</button>
			)}
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
	/** For a row inside a group: the top-level group it belongs to, which clicking the row selects (parts of a group are not selected alone). */
	selectsId?: NodeId;
	selected: boolean;
	onSelect: (id: NodeId, additive: boolean) => void;
	dispatch: Dispatch<EditorAction>;
}

function ObjectRow({ design, id, selectsId, selected, onSelect, dispatch }: ObjectRowProps) {
	// a group's row starts closed; opened, it lists what the group holds, each with its own eye and padlock
	const [open, setOpen] = useState(false);
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
			<button type="button" className={selected ? 'selected' : undefined} onClick={(e) => onSelect(selectsId ?? id, e.shiftKey)}>
				<span
					className={`dot ${node.mode}`}
					style={node.mode === 'hole' ? { borderColor: node.color } : { background: node.color }}
					aria-hidden="true"
				/>
				<span className="object-name">
					{node.name} ({fmt(x)}, {fmt(y)})
				</span>
			</button>
			{node.kind === 'group' && (
				<button
					type="button"
					className="row-toggle"
					aria-expanded={open}
					aria-label={open ? 'Hide contents' : 'Show contents'}
					title={open ? 'Hide what is in this group' : 'Show what is in this group, to hide or lock its parts'}
					onClick={() => setOpen(!open)}
				>
					<span aria-hidden="true">{open ? '▾' : '▸'}</span>
				</button>
			)}
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
			{node.kind === 'group' && open && (
				<ul className="object-children">
					{node.children.map((child) => (
						<ObjectRow
							key={child}
							design={design}
							id={child}
							selectsId={selectsId ?? id}
							selected={false}
							onSelect={onSelect}
							dispatch={dispatch}
						/>
					))}
				</ul>
			)}
		</li>
	);
}
